import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";

import { stringifyJsonSafe, toJsonSafe } from "../lib/jsonSafe.ts";

export type YahooFinanceMcpClient = Record<
  string,
  (...args: unknown[]) => unknown
>;

export interface CreateYahooFinanceMcpServerOptions {
  /** Existing yahoo-finance2 client instance to expose over MCP. */
  client: YahooFinanceMcpClient;
  /** MCP server name shown to clients. */
  name?: string;
  /** MCP server version shown to clients. */
  version?: string;
  /** Optional allow-list of tool names to expose. */
  enabledTools?: string[];
}

interface ToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
  call: (
    client: YahooFinanceMcpClient,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
}

const looseObjectSchema = z.object({}).passthrough();
const moduleOptionsSchema = looseObjectSchema.describe(
  "Optional yahoo-finance2 module options such as validateResult, validateOptions, queue, or fetchOptions.",
);

const commonToolOptions = {
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function queryOptions(input: Record<string, unknown>) {
  return input.queryOptions as Record<string, unknown> | undefined;
}

function moduleOptions(input: Record<string, unknown>) {
  return input.moduleOptions as Record<string, unknown> | undefined;
}

async function callClient(
  client: YahooFinanceMcpClient,
  methodName: string,
  args: unknown[],
) {
  const method = client[methodName];
  if (typeof method !== "function") {
    throw new Error(`Configured YahooFinance client has no ${methodName}().`);
  }
  return await method.apply(client, args);
}

function callResult(result: unknown): CallToolResult {
  const safe = toJsonSafe(result);
  return {
    content: [{ type: "text", text: stringifyJsonSafe(safe) }],
    structuredContent: { result: safe },
  };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : `Error: ${String(error)}`;

  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function buildSymbolTool(
  name: string,
  title: string,
  description: string,
): ToolSpec {
  return {
    name,
    title,
    description,
    inputSchema: {
      symbol: z.string().describe("Yahoo Finance symbol, e.g. AAPL."),
      queryOptions: looseObjectSchema.optional().describe(
        `Optional query options passed to yahooFinance.${name}().`,
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, name, [
        input.symbol,
        queryOptions(input),
        moduleOptions(input),
      ]),
  };
}

const TOOL_SPECS: ToolSpec[] = [
  {
    name: "quote",
    title: "Quote",
    description:
      "Get real-time or near real-time quote data for one or more Yahoo Finance symbols.",
    inputSchema: {
      query: z.union([z.string(), z.array(z.string())]).describe(
        'Yahoo Finance symbol or symbols, e.g. "AAPL" or ["AAPL", "MSFT"].',
      ),
      queryOptions: looseObjectSchema.optional().describe(
        'Optional quote options such as fields or return: "array", "object", or "map".',
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "quote", [
        input.query,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
  {
    name: "search",
    title: "Search",
    description:
      "Search Yahoo Finance instruments, companies, and related news by symbol, name, or keyword.",
    inputSchema: {
      query: z.string().describe(
        'Search term, company name, or symbol, e.g. "Apple" or "AAPL".',
      ),
      queryOptions: looseObjectSchema.optional().describe(
        "Optional search options such as quotesCount, newsCount, region, lang, or enableFuzzyQuery.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "search", [
        input.query,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
  buildSymbolTool(
    "quoteSummary",
    "Quote Summary",
    "Get quote summary data modules such as price, summaryDetail, assetProfile, and secFilings.",
  ),
  {
    name: "chart",
    title: "Chart",
    description:
      "Fetch chart-ready historical price, dividend, split, and earnings data for a symbol.",
    inputSchema: {
      symbol: z.string().describe("Yahoo Finance symbol, e.g. AAPL."),
      queryOptions: looseObjectSchema.describe(
        "Chart options. Must include period1; may include period2, interval, includePrePost, events, and return.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "chart", [
        input.symbol,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
  {
    name: "historical",
    title: "Historical",
    description:
      "Get historical price, dividend, or split records for a symbol.",
    inputSchema: {
      symbol: z.string().describe("Yahoo Finance symbol, e.g. AAPL."),
      queryOptions: looseObjectSchema.describe(
        "Historical options. Must include period1; may include period2, interval, events, and includeAdjustedClose.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "historical", [
        input.symbol,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
  buildSymbolTool(
    "options",
    "Options Chain",
    "Get options chain data including calls, puts, strikes, expirations, and quote data.",
  ),
  {
    name: "trendingSymbols",
    title: "Trending Symbols",
    description:
      "Get Yahoo Finance trending symbols for a region such as US, GB, or DE.",
    inputSchema: {
      region: z.string().describe('Region code, e.g. "US", "GB", or "DE".'),
      queryOptions: looseObjectSchema.optional().describe(
        "Optional trending symbols options such as lang, region, or count.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "trendingSymbols", [
        input.region,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
  {
    name: "screener",
    title: "Screener",
    description:
      "Run a predefined Yahoo Finance stock screener such as day_gainers, day_losers, or most_actives.",
    inputSchema: {
      scrId: z.string().optional().describe(
        'Predefined screener id, e.g. "day_gainers", "day_losers", or "most_actives".',
      ),
      queryOptions: looseObjectSchema.optional().describe(
        "Optional screener options such as scrIds, count, region, lang, or start.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) => {
      const scrId = input.scrId;
      const opts = queryOptions(input);
      return callClient(client, "screener", [
        typeof scrId === "string" ? scrId : opts ?? {},
        typeof scrId === "string" ? opts : undefined,
        moduleOptions(input),
      ]);
    },
  },
  {
    name: "recommendationsBySymbol",
    title: "Recommendations By Symbol",
    description:
      "Get related and similar stock recommendations for one or more symbols.",
    inputSchema: {
      query: z.union([z.string(), z.array(z.string())]).describe(
        'Yahoo Finance symbol or symbols, e.g. "AAPL" or ["AAPL", "MSFT"].',
      ),
      queryOptions: looseObjectSchema.optional().describe(
        "Optional recommendations query options.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "recommendationsBySymbol", [
        input.query,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
  buildSymbolTool(
    "insights",
    "Insights",
    "Get Yahoo Finance analyst insights, reports, significant developments, and event data for a symbol.",
  ),
  {
    name: "fundamentalsTimeSeries",
    title: "Fundamentals Time Series",
    description:
      "Get financial statement time series data such as financials, balance sheet, or cash flow data.",
    inputSchema: {
      symbol: z.string().describe("Yahoo Finance symbol, e.g. AAPL."),
      queryOptions: looseObjectSchema.describe(
        "Fundamentals options. Must include period1 and module; may include period2, type, merge, padTimeSeries, lang, and region.",
      ),
      moduleOptions: moduleOptionsSchema.optional(),
    },
    call: (client, input) =>
      callClient(client, "fundamentalsTimeSeries", [
        input.symbol,
        queryOptions(input),
        moduleOptions(input),
      ]),
  },
];

export function getYahooFinanceMcpToolNames(): string[] {
  return TOOL_SPECS.map((tool) => tool.name);
}

export function createYahooFinanceMcpServer(
  options: CreateYahooFinanceMcpServerOptions,
): McpServer {
  const enabledTools = options.enabledTools ??
    getYahooFinanceMcpToolNames();
  const knownToolNames = new Set(getYahooFinanceMcpToolNames());
  const unknownTools = enabledTools.filter((name) => !knownToolNames.has(name));
  if (unknownTools.length) {
    throw new Error(`Unknown MCP tool(s): ${unknownTools.join(", ")}`);
  }

  const server = new McpServer(
    {
      name: options.name ?? "yahoo-finance2",
      version: options.version ?? "0.0.0",
    },
    {
      instructions:
        "Use these tools to retrieve Yahoo Finance market data. Search for symbols before quote or summary calls when the symbol is uncertain. Data comes from Yahoo Finance and may be delayed, unavailable, or removed for delisted symbols.",
    },
  );

  for (const spec of TOOL_SPECS) {
    if (!enabledTools.includes(spec.name)) continue;

    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.inputSchema,
        ...commonToolOptions,
      },
      async (input: unknown) => {
        try {
          const result = await spec.call(
            options.client,
            input as Record<string, unknown>,
          );
          return callResult(result);
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }

  return server;
}
