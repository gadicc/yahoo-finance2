import YahooFinance from "yahoo-finance2";
import * as legacyEntry from "yahoo-finance2/src/index.ts";
import * as rootEntry from "yahoo-finance2";
import * as createClientEntry from "yahoo-finance2/createYahooFinance";
import * as mcpEntry from "yahoo-finance2/mcp";
import * as mcpHttpEntry from "yahoo-finance2/mcp/http";
import * as mcpServerEntry from "yahoo-finance2/mcp/server";
import * as modulesEntry from "yahoo-finance2/modules";
import * as autocEntry from "yahoo-finance2/modules/autoc";
import * as chartEntry from "yahoo-finance2/modules/chart";
import * as dailyGainersEntry from "yahoo-finance2/modules/dailyGainers";
import * as dailyLosersEntry from "yahoo-finance2/modules/dailyLosers";
import * as fundamentalsEntry from "yahoo-finance2/modules/fundamentalsTimeSeries";
import * as historicalEntry from "yahoo-finance2/modules/historical";
import * as insightsEntry from "yahoo-finance2/modules/insights";
import * as optionsEntry from "yahoo-finance2/modules/options";
import * as quoteSummaryInterfaces from "yahoo-finance2/modules/quoteSummary-iface";
import * as quoteSummaryEntry from "yahoo-finance2/modules/quoteSummary";
import * as quoteEntry from "yahoo-finance2/modules/quote";
import * as recommendationsEntry from "yahoo-finance2/modules/recommendationsBySymbol";
import * as screenerEntry from "yahoo-finance2/modules/screener";
import * as searchEntry from "yahoo-finance2/modules/search";
import * as trendingEntry from "yahoo-finance2/modules/trendingSymbols";
import * as otherEntry from "yahoo-finance2/other";
import * as quoteCombineEntry from "yahoo-finance2/other/quoteCombine";
import * as moduleCommonEntry from "yahoo-finance2/lib/moduleCommon";
import * as cookieJarEntry from "yahoo-finance2/lib/cookieJar";
import * as getCrumbEntry from "yahoo-finance2/lib/getCrumb";
import * as optionsHelpersEntry from "yahoo-finance2/lib/options";
import { ExtendedCookieJar } from "yahoo-finance2/lib/cookieJar";
import { createYahooFinanceMcpWebHandler } from "yahoo-finance2/mcp/http";

const searchResponse = {
  explains: [],
  count: 1,
  quotes: [
    {
      exchange: "NMS",
      shortname: "Apple Inc.",
      quoteType: "EQUITY",
      symbol: "AAPL",
      index: "quotes",
      score: 17709500,
      typeDisp: "Equity",
      longname: "Apple Inc.",
      exchDisp: "NASDAQ",
      sector: "Technology",
      industry: "Consumer Electronics",
      dispSecIndFlag: true,
      isYahooFinance: true,
    },
  ],
  news: [],
  nav: [],
  lists: [],
  researchReports: [],
  screenerFieldResults: [],
  totalTime: 10,
  timeTakenForQuotes: 1,
  timeTakenForNews: 1,
  timeTakenForAlgowatchlist: 1,
  timeTakenForPredefinedScreener: 1,
  timeTakenForCrunchbase: 1,
  timeTakenForNav: 1,
  timeTakenForResearchReports: 1,
  timeTakenForScreenerField: 1,
  timeTakenForCulturalAssets: 1,
  timeTakenForSearchLists: 1,
};

type FetchCall = {
  url: string;
  cookie: string | null;
  userAgent: string | null;
};

function createLogger() {
  const warnings: string[] = [];
  return {
    logger: {
      debug() {},
      dir() {},
      error() {},
      info() {},
      warn(message: unknown) {
        warnings.push(String(message));
      },
    },
    warnings,
  };
}

const publicNamespaces = {
  "./src/index.ts": legacyEntry,
  ".": rootEntry,
  "./createYahooFinance": createClientEntry,
  "./mcp": mcpEntry,
  "./mcp/http": mcpHttpEntry,
  "./mcp/server": mcpServerEntry,
  "./modules": modulesEntry,
  "./modules/autoc": autocEntry,
  "./modules/chart": chartEntry,
  "./modules/dailyGainers": dailyGainersEntry,
  "./modules/dailyLosers": dailyLosersEntry,
  "./modules/fundamentalsTimeSeries": fundamentalsEntry,
  "./modules/historical": historicalEntry,
  "./modules/insights": insightsEntry,
  "./modules/options": optionsEntry,
  "./modules/quoteSummary-iface": quoteSummaryInterfaces,
  "./modules/quoteSummary": quoteSummaryEntry,
  "./modules/quote": quoteEntry,
  "./modules/recommendationsBySymbol": recommendationsEntry,
  "./modules/screener": screenerEntry,
  "./modules/search": searchEntry,
  "./modules/trendingSymbols": trendingEntry,
  "./other": otherEntry,
  "./other/quoteCombine": quoteCombineEntry,
  "./lib/moduleCommon": moduleCommonEntry,
  "./lib/cookieJar": cookieJarEntry,
  "./lib/getCrumb": getCrumbEntry,
  "./lib/options": optionsHelpersEntry,
};

function streamedJson(value: unknown, onChunk: () => void): Response {
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);
  const emoji = new TextEncoder().encode(
    text.slice(0, text.indexOf("🍎")),
  ).length;
  const cuts = text.includes("🍎")
    ? [emoji + 1, emoji + 3]
    : [1, Math.floor(bytes.length / 2)];
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of [
          bytes.slice(0, cuts[0]),
          bytes.slice(cuts[0], cuts[1]),
          bytes.slice(cuts[1]),
        ]) {
          controller.enqueue(part);
          onChunk();
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export default {
  async fetch(
    request: Request<unknown, IncomingRequestCfProperties>,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/exports") {
      return Response.json({
        entries: Object.fromEntries(
          Object.entries(publicNamespaces).map(([name, value]) => [
            name,
            Object.keys(value).sort(),
          ]),
        ),
        rootAlias: legacyEntry.default === YahooFinance,
        grade: quoteSummaryInterfaces.Grade.StrongBuy,
        module: typeof quoteEntry.default,
        cookieJar: typeof ExtendedCookieJar,
      });
    }
    if (pathname === "/mcp") {
      const handler = createYahooFinanceMcpWebHandler({
        client: { quote: async () => ({ symbol: "AAPL", price: 123.45 }) },
        enabledTools: ["quote"],
        allowedHosts: ["worker.test"],
      });
      return handler(request);
    }
    const calls: FetchCall[] = [];
    const { logger, warnings } = createLogger();
    const cookieJar = new ExtendedCookieJar();
    let streamedChunks = 0;
    const mockFetch: typeof fetch = async (input, init) => {
      const outgoing = new Request(input, init);
      const url = new URL(outgoing.url);
      if (
        url.hostname !== "query2.finance.yahoo.com" ||
        url.pathname !== "/v1/finance/search"
      ) {
        throw new Error("Unexpected controlled Worker fetch URL");
      }
      calls.push({
        url: outgoing.url,
        cookie: outgoing.headers.get("cookie"),
        userAgent: outgoing.headers.get("user-agent"),
      });
      const value =
        pathname === "/stream"
          ? {
              ...searchResponse,
              quotes: [
                { ...searchResponse.quotes[0], longname: "Apple 🍎 Inc." },
              ],
              news: [
                {
                  uuid: "worker-news",
                  title: "Apple 🍎 news",
                  publisher: "test",
                  link: "https://example.test/story",
                  providerPublishTime: 1700000000,
                  type: "STORY",
                },
              ],
            }
          : searchResponse;
      if (pathname === "/stream")
        return streamedJson(value, () => {
          streamedChunks++;
        });
      const response = Response.json(value);
      if (pathname === "/cookies" && calls.length === 1) {
        response.headers.append(
          "Set-Cookie",
          "workerA=alpha; Path=/; Secure; HttpOnly; Expires=Wed, 21 Oct 2037 07:28:00 GMT",
        );
        response.headers.append(
          "Set-Cookie",
          "workerB=beta; Path=/; Secure; HttpOnly",
        );
      }
      return response;
    };
    const yahooFinance = new YahooFinance({
      ...(pathname === "/global-fetch"
        ? {}
        : {
            fetch:
              pathname === "/request-fetch"
                ? async () => {
                    throw new Error("Constructor fetch must be overridden");
                  }
                : mockFetch,
          }),
      cookieJar,
      logger,
      suppressNotices: ["yahooSurvey"],
      versionCheck: false,
    });
    if (pathname === "/invalid") {
      try {
        // @ts-expect-error an invalid option must fail both types and runtime schema validation
        await yahooFinance.search("AAPL", { definitelyNotAnOption: true });
        return Response.json({ rejected: false }, { status: 500 });
      } catch {
        return Response.json({ rejected: true, fetchCalls: calls.length });
      }
    }
    const result = await yahooFinance.search(
      "AAPL",
      {},
      pathname === "/request-fetch" ? { fetch: mockFetch } : undefined,
    );
    if (pathname === "/cookies") await yahooFinance.search("AAPL");
    const body = {
      ok: true,
      result,
      calls,
      warnings,
      streamedChunks,
      newsIsDate: result.news[0]?.providerPublishTime instanceof Date,
      cookieKeys: (
        await cookieJar.getCookies("https://query2.finance.yahoo.com/")
      )
        .map((cookie) => cookie.key)
        .sort(),
    };
    return pathname === "/stream"
      ? streamedJson(body, () => {})
      : Response.json(body);
  },
} satisfies ExportedHandler;
