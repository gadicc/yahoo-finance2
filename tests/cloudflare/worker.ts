import YahooFinance from "yahoo-finance2";

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

export default {
  async fetch(): Promise<Response> {
    const calls: FetchCall[] = [];
    const { logger, warnings } = createLogger();

    const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push({
        url: request.url,
        cookie: request.headers.get("cookie"),
        userAgent: request.headers.get("user-agent"),
      });

      return Promise.resolve(Response.json(searchResponse));
    };

    const yahooFinance = new YahooFinance({
      fetch,
      logger,
      suppressNotices: ["yahooSurvey"],
      versionCheck: false,
    });

    const result = await yahooFinance.search("AAPL");

    return Response.json({
      ok: true,
      result,
      calls,
      warnings,
    });
  },
};
