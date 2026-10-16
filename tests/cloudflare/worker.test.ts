import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import("./worker");
    }
  }
}

interface WorkerResult {
  ok: boolean;
  result: {
    quotes: Array<{ symbol: string; longname?: string }>;
    news: Array<{ title: string; providerPublishTime: string }>;
  };
  calls: Array<{
    url: string;
    cookie: string | null;
    userAgent: string | null;
  }>;
  warnings: string[];
  streamedChunks: number;
  newsIsDate: boolean;
  cookieKeys: string[];
}
const expectedEntries = [
  "./src/index.ts",
  ".",
  "./createYahooFinance",
  "./mcp",
  "./mcp/http",
  "./mcp/server",
  "./modules",
  "./modules/autoc",
  "./modules/chart",
  "./modules/dailyGainers",
  "./modules/dailyLosers",
  "./modules/fundamentalsTimeSeries",
  "./modules/historical",
  "./modules/insights",
  "./modules/options",
  "./modules/quoteSummary-iface",
  "./modules/quoteSummary",
  "./modules/quote",
  "./modules/recommendationsBySymbol",
  "./modules/screener",
  "./modules/search",
  "./modules/trendingSymbols",
  "./other",
  "./other/quoteCombine",
  "./lib/moduleCommon",
  "./lib/cookieJar",
  "./lib/getCrumb",
  "./lib/options",
];

async function run(path = "/"): Promise<WorkerResult> {
  const response = await exports.default.fetch("https://worker.test" + path);
  expect(response.status).toBe(200);
  return (await response.json()) as WorkerResult;
}

afterEach(() => vi.restoreAllMocks());

describe("yahoo-finance2 in Cloudflare Workers", () => {
  it("loads every generated public entry including MCP from the installed package", async () => {
    const response = await exports.default.fetch("https://worker.test/exports");
    const body = (await response.json()) as {
      entries: Record<string, string[]>;
      rootAlias: boolean;
      grade: string;
      module: string;
      cookieJar: string;
    };
    expect(Object.keys(body.entries)).toEqual(expectedEntries);
    expect(body.entries["./lib/moduleCommon"]).toEqual([]);
    expect(body.entries["./mcp/http"]).toContain(
      "createYahooFinanceMcpWebHandler",
    );
    expect(body.rootAlias).toBe(true);
    expect(body.grade).toBe("Strong Buy");
    expect(body.module).toBe("function");
    expect(body.cookieJar).toBe("function");
  });

  it("imports, constructs and validates a controlled search with versioned headers", async () => {
    const body = await run();
    expect(body.ok).toBe(true);
    expect(body.result.quotes[0]?.symbol).toBe("AAPL");
    expect(body.calls).toHaveLength(1);
    expect(body.calls[0]?.url).toContain(
      "https://query2.finance.yahoo.com/v1/finance/search",
    );
    expect(body.calls[0]?.url).toContain("q=AAPL");
    expect(body.calls[0]?.cookie).toBe("");
    expect(body.calls[0]?.userAgent).toContain("yahoo-finance2/0.0.1");
    expect(body.warnings.join("\n")).not.toContain("Unsupported environment");
  });

  it("uses per-request fetch ahead of the constructor fetch", async () => {
    const body = await run("/request-fetch");
    expect(body.result.quotes[0]?.symbol).toBe("AAPL");
    expect(body.calls).toHaveLength(1);
  });

  it("uses the native global fetch boundary when no custom fetch is provided", async () => {
    const responses: string[] = [];
    const baseline = await run();
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        responses.push(request.url);
        // Runtime validation receives ordinary Yahoo JSON, not the fixture wrapper.
        return Response.json({ ...baseline.result });
      });
    const body = await run("/global-fetch");
    expect(body.result.quotes[0]?.symbol).toBe("AAPL");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(responses[0]).toContain("/v1/finance/search");
  });

  it("persists separate Set-Cookie headers with comma-containing expiry and isolates requests", async () => {
    const body = await run("/cookies");
    expect(body.calls).toHaveLength(2);
    expect(body.calls[0]?.cookie).toBe("");
    expect(body.calls[1]?.cookie).toContain("workerA=alpha");
    expect(body.calls[1]?.cookie).toContain("workerB=beta");
    expect(body.cookieKeys).toEqual(["workerA", "workerB"]);
    const independent = await run("/cookies");
    expect(independent.calls[0]?.cookie).toBe("");
  });

  it("consumes split UTF-8 JSON streams and preserves date coercion through a streamed response", async () => {
    const response = await exports.default.fetch("https://worker.test/stream");
    expect(response.body).toBeInstanceOf(ReadableStream);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text) as WorkerResult;
    expect(body.streamedChunks).toBe(3);
    expect(body.result.quotes[0]?.longname).toBe("Apple 🍎 Inc.");
    expect(body.result.news[0]?.title).toBe("Apple 🍎 news");
    expect(body.newsIsDate).toBe(true);
    expect(body.result.news[0]?.providerPublishTime).toBe(
      "2023-11-14T22:13:20.000Z",
    );
  });

  it("rejects invalid typed/schema options before the fetch boundary", async () => {
    const response = await exports.default.fetch("https://worker.test/invalid");
    expect(await response.json()).toEqual({ rejected: true, fetchCalls: 0 });
  });

  it("runs MCP web initialize, tools/list and tools/call inside workerd", async () => {
    const call = async (id: number, method: string, params: object) => {
      const response = await exports.default.fetch("https://worker.test/mcp", {
        method: "POST",
        headers: {
          Host: "worker.test",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as {
        result: {
          serverInfo?: { name: string };
          tools?: Array<{ name: string }>;
          structuredContent?: { result: { symbol: string } };
        };
      };
    };
    const initialized = await call(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "worker-test", version: "1" },
    });
    expect(initialized.result.serverInfo?.name).toBe("yahoo-finance2");
    expect(
      (await call(2, "tools/list", {})).result.tools?.map((tool) => tool.name),
    ).toEqual(["quote"]);
    const result = await call(3, "tools/call", {
      name: "quote",
      arguments: { query: "AAPL" },
    });
    expect(result.result.structuredContent?.result.symbol).toBe("AAPL");
  });
});
