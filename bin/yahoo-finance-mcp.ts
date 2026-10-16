#!/usr/bin/env node
import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import YahooFinance from "../src/index.ts";
import type { Logger } from "../src/lib/options/options.ts";
import {
  createYahooFinanceMcpNodeHandler,
  createYahooFinanceMcpServer,
  getYahooFinanceMcpToolNames,
  type YahooFinanceMcpClient,
} from "../src/mcp/mod.ts";
import pkg from "../deno.json" with { type: "json" };
import { closeOnSignals, createCookieJar, isMainModule } from "./runtime.ts";

type TransportName = "stdio" | "http";

export interface McpCliOptions {
  transport: TransportName;
  host: string;
  port: number;
  path: string;
  token?: string;
  tools?: string[];
  unsafeNoToken: boolean;
}

class UsageError extends Error {
  override name = "UsageError";
}

function formatForLog(value: unknown) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function createStderrLogger(): Logger {
  return {
    info: (...args) => console.error(...args),
    warn: (...args) => console.error(...args),
    error: (...args) => console.error(...args),
    debug: () => {},
    dir: (value) => console.error(formatForLog(value)),
  };
}

function createClient(logger: Logger): YahooFinanceMcpClient {
  const cookieJar = createCookieJar();
  return new YahooFinance({
    cookieJar,
    logger,
    suppressNotices: ["yahooSurvey"],
  }) as unknown as YahooFinanceMcpClient;
}

function formatHelp() {
  return [
    `yahoo-finance2 MCP server version: ${pkg.version}`,
    "Usage: yahoo-finance-mcp [--stdio]",
    "       yahoo-finance-mcp --http [--host 127.0.0.1] [--port 3000] [--path /mcp]",
    "",
    "Options:",
    "  --stdio                  Run MCP over stdio (default)",
    "  --http                   Run MCP over Streamable HTTP",
    "  --transport <stdio|http> Select transport explicitly",
    "  --host <host>            HTTP bind host (default: 127.0.0.1)",
    "  --port <port>            HTTP bind port (default: 3000)",
    "  --path <path>            HTTP MCP path (default: /mcp)",
    "  --token <token>          Require Authorization: Bearer <token> for HTTP",
    "  --tools <a,b>            Comma-separated allow-list of MCP tools",
    "  --unsafe-no-token        Allow non-local HTTP binding without a token",
    "  -h, --help               Show this help",
    "  -v, --version            Show version",
    "",
    "Environment:",
    "  YAHOO_FINANCE_MCP_TOKEN  HTTP bearer token if --token is omitted",
    "",
    "Available tools:",
    `  ${getYahooFinanceMcpToolNames().join(", ")}`,
  ].join("\n");
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new UsageError(`${flag} requires a value.`);
  }
  return value;
}

export function parseMcpArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): McpCliOptions | "help" | "version" {
  const options: McpCliOptions = {
    transport: "stdio",
    host: "127.0.0.1",
    port: 3000,
    path: "/mcp",
    token: env.YAHOO_FINANCE_MCP_TOKEN || undefined,
    unsafeNoToken: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case "-h":
      case "--help":
        return "help";
      case "-v":
      case "--version":
        return "version";
      case "--stdio":
        options.transport = "stdio";
        break;
      case "--http":
        options.transport = "http";
        break;
      case "--transport": {
        const value = readValue(args, index, arg);
        if (value !== "stdio" && value !== "http") {
          throw new UsageError("--transport must be either stdio or http.");
        }
        options.transport = value;
        index++;
        break;
      }
      case "--host":
        options.host = readValue(args, index, arg);
        index++;
        break;
      case "--port": {
        const value = Number(readValue(args, index, arg));
        if (!Number.isInteger(value) || value < 0 || value > 65535) {
          throw new UsageError("--port must be an integer from 0 to 65535.");
        }
        options.port = value;
        index++;
        break;
      }
      case "--path": {
        const value = readValue(args, index, arg);
        if (!value.startsWith("/")) {
          throw new UsageError("--path must start with /.");
        }
        options.path = value;
        index++;
        break;
      }
      case "--token":
        options.token = readValue(args, index, arg);
        index++;
        break;
      case "--tools":
        options.tools = readValue(args, index, arg)
          .split(",")
          .map((tool) => tool.trim())
          .filter(Boolean);
        index++;
        break;
      case "--unsafe-no-token":
        options.unsafeNoToken = true;
        break;
      default:
        throw new UsageError(
          "Unknown option. Use --help for supported options.",
        );
    }
  }

  return options;
}

export function isLocalHost(host: string) {
  return host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]";
}

async function runStdio(options: McpCliOptions) {
  const client = createClient(createStderrLogger());
  const server = createYahooFinanceMcpServer({
    client,
    version: pkg.version,
    enabledTools: options.tools,
  });
  const transport = new StdioServerTransport();
  const lifecycle = closeOnSignals(() => server.close(), process.stdin);
  try {
    await server.connect(transport);
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }
}

export function validateHttpOptions(options: McpCliOptions) {
  if (
    !isLocalHost(options.host) &&
    !options.token &&
    !options.unsafeNoToken
  ) {
    throw new UsageError(
      "Refusing to bind HTTP MCP to a non-local host without --token. " +
        "Use --token or --unsafe-no-token.",
    );
  }
}

async function runHttp(options: McpCliOptions) {
  validateHttpOptions(options);
  const client = createClient(createStderrLogger());
  const handler = createYahooFinanceMcpNodeHandler({
    client,
    version: pkg.version,
    path: options.path,
    bearerToken: options.token,
    enabledTools: options.tools,
    allowedHosts: isLocalHost(options.host) ? undefined : [],
  });
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  const lifecycle = closeOnSignals(() =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    })
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch {
    await lifecycle.shutdown();
    throw new Error("Unable to start the MCP HTTP server.");
  }
  server.on("error", () => {
    console.error("Error: MCP HTTP server failed.");
    process.exitCode = 1;
    void lifecycle.shutdown();
  });
  const address = server.address();
  const resolvedPort = typeof address === "object" && address
    ? address.port
    : options.port;
  const auth = options.token ? " with bearer token auth" : "";
  console.error(
    `yahoo-finance2 MCP HTTP listening on http://${options.host}:${resolvedPort}${options.path}${auth}`,
  );
}

export async function mainMcp(args = process.argv.slice(2)): Promise<number> {
  let token = process.env.YAHOO_FINANCE_MCP_TOKEN;
  try {
    const options = parseMcpArgs(args);
    if (options === "help") {
      console.log(formatHelp());
      return 0;
    }
    if (options === "version") {
      console.log(pkg.version);
      return 0;
    }
    token = options.token;
    if (options.transport === "http") await runHttp(options);
    else await runStdio(options);
    return 0;
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "MCP startup failed.";
    const message = token ? detail.split(token).join("[redacted]") : detail;
    console.error(
      `${error instanceof UsageError ? error.name : "Error"}: ${message}`,
    );
    return error instanceof UsageError ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  void mainMcp().then((code) => {
    process.exitCode = code || process.exitCode || 0;
  }).catch(() => {
    console.error("Error: Unable to run the Yahoo Finance MCP server.");
    process.exitCode = 1;
  });
}
