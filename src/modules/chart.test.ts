import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
  spy,
  spyLogger,
  testSymbols,
} from "../../tests/common.ts";

import chart from "./chart.ts";

const YahooFinance = createTestYahooFinance({ modules: { chart } });
const yf = new YahooFinance();

describe("chart", () => {
  setupCache();
  // See also common module tests in moduleExec.spec.js

  const symbols = testSymbols({
    skip: [
      "ADH", // currency: null; Yahoo-finance does show a chart though, should we allow this?
      "BEKE", // BadRequestError: Data doesn't exist for startDate = 1577836800, endDate = 1578009600
      "BFLY", // BadRequestError: Data doesn't exist for startDate = 1577836800, endDate = 1578009600
      "^VXAPL", // firstTradeDate: null; Yahoo-finance shows an empty chart even though there's some data.
      "SWVXX", // BadRequestError: Data doesn't exist for startDate = 1577836800, endDate = 1578009600
    ],
  });

  it.each(symbols)(
    "passes validation for symbol '%s'",
    async (symbol, t, onFinish) => {
      await yf.chart(
        symbol,
        {
          period1: "2020-01-01",
          period2: "2020-01-03",
          return: "object", // native Yahoo return format, first validation step.
        },
        {
          devel: {
            id: `chart-${symbol}-2020-01-01-to-2020-01-03`,
            t,
            onFinish,
          },
        },
      );
    },
  );

  it("passes validation if some results are null", async (t, onFinish) => {
    await yf.chart(
      "WSU.DE",
      {
        period1: "2023-08-04", // This was yielding a FailedYahooValidationError since
        period2: "2023-08-09", // there are no results on the 2023-08-07
        return: "object", // native Yahoo return format, first validation step.
      },
      {
        devel: { id: `chart-WSU.DE-2023-08-04-to-2023-08-09`, t, onFinish },
      },
    );
  });

  it("throws if period1,period2 are the same", async () => {
    await expect(
      yf.chart("TSLA", { period1: "2022-02-22", period2: "2022-02-22" }),
    ).rejects.toThrow(/cannot share the same value/);
  });

  it("validates when includePrePost=false interval=1m", async (t, onFinish) => {
    await yf.chart(
      "AAPL",
      {
        period1: "2025-02-01",
        period2: "2025-02-02",
        interval: "1m",
        includePrePost: false,
      },
      {
        devel: {
          // Static because otherwise we get
          // Error: 1m data not available for startTime=1738368000 and endTime=1738454400. The requested range must be within the last 30 days.
          id:
            `chart-AAPL-2025-02-01-to-2025-02-02-includePrePost-false-interval-1m.static`,
          t,
          onFinish,
        },
      },
    );
  });

  it("handles null currency field", async () => {
    await yf.chart(
      "LUCYW",
      {
        period1: "2024-01-01",
        period2: "2024-01-02",
        return: "object",
      },
      {
        devel: "chart-LUCYW-null-currency.json",
      },
    );
  });

  describe("specific cases", () => {
    it("optional fields, empty arrays", async (t, onFinish) => {
      /*
       * Same day period with 1h interval, this result has these aspects:
       *
       *   - Missing fields: timestamp (because no quotes)
       *   - New fields: previousClose, scale, tradingPeriods
       *   - Pecularity: indicators.quote is [{}], indicators.adjclose missing
       */
      await yf.chart(
        "TSLA",
        // This is a .fake.json test not because we've modified the result,
        // but because chart() no longer allows period1===period2 (because
        // it leads to these kind of results).  Nevertheless, let's be prepared.
        // So the .fake.json result is from query period1=period2="2021-11-23".
        { period1: "2025-01-01", period2: "2025-01-02", interval: "1h" },
        {
          devel: {
            id: "chart-TSLA-2025-01-01-to-2025-01-02-interval-1h.fake",
            t,
            onFinish,
          },
        },
      );
    });

    // Skip nocache tests because:
    // "30m data not available for startTime=1637539200 and endTime=1637625600.
    // The requested range must be within the last 60 days."
    /* XXX TODO
    if (PERFORM_FAKE_TESTS) {
      it("handles queries with tradingPeriod.regular", async () => {
        // Had tradingPeriod.regular, probably a timezone thing
        await yf.chart(
          "TSLA",
          { period1: "2021-11-22", period2: "2021-11-23", interval: "30m" },
          { devel: "chart-TSLA-2021-11-22-to-2021-11-23-interval-30m.json" },
        );
      });
    }
    */
  });

  describe("pre-emptive checks", () => {
    it("!timestamp, quotes.length !== 1", (t, onFinish) => {
      return expect(
        yf.chart(
          "FAKE",
          { period1: "2021-11-23" },
          {
            devel: { id: "chart-notimestamp-quotes-length.fake", t, onFinish },
          },
        ),
      ).rejects.toMatchObject({
        message: /No timestamp with quotes.length !== 1/,
      });
    });

    it("!timestamp, quote != {}", (t, onFinish) => {
      return expect(
        yf.chart(
          "FAKE",
          { period1: "2021-11-23" },
          { devel: { id: "chart-notimestamp-weird-quote.fake", t, onFinish } },
        ),
      ).rejects.toMatchObject({
        message: /No timestamp with unexpected quote/,
      });
    });
  });

  it("throws on malformed result", (t, onFinish) => {
    const logger = spyLogger();
    const yf = new YahooFinance({ logger });

    return expect((() => {
      return yf
        .chart(
          "AAPL",
          { period1: "2020-01-01" },
          { devel: { id: "weirdJsonResult.fake", t, onFinish } },
        );
    })()).rejects.toMatchObject({ message: /Unexpected/ });
  });

  describe("query transformWith", () => {
    /*
     * We need "transformWith" that chart() calls moduleExec() with.
     * So we create a fake moduleExec and grab it from the query params.
     * The below call is a promise that will resolve outside of this
     * test block, but that's ok, as it's irrelevant for this test.
     * As long as it doesn't throw an error, that could confuse jest :)
     */
    const yf = {
      _moduleExec: spy(() => ({
        meta: {},
        timestamp: [],
      })),
      chart,
    };

    yf.chart("symbol", { period1: "required-but-not-used" });
    // @ts-expect-error: ok
    const { transformWith } = yf._moduleExec.calls[0].args[0].query;

    it("uses today's date as default for period2", () => {
      const now = new Date();
      const options = transformWith({ period1: "2020-01-01" });
      expect(options.period2).toBeDefined();
      expect(options.period2).toBe(Math.floor(now.getTime() / 1000));
    });
  });

  describe("return type", () => {
    const symbol = "AAPL"; // split 2020-08-31, div 2020-11-06
    const queryOpts = { period1: "2020-08-31", period2: "2020-11-07" };
    const id = "chart-AAPL-2020-08-31-to-2020-11-07";
    it("array (not specified, as default)", async (t, onFinish) => {
      const result = await yf.chart(
        symbol,
        { ...queryOpts /* default, i.e. return: "array" */ },
        { devel: { id, t, onFinish } },
      );

      // More comprehensive tests below.
      // @ts-expect-error: we're testing for mistakes.
      expect(result.timestamp).not.toBeDefined();
    });

    it("array", async (t, onFinish) => {
      const result = await yf.chart(
        symbol,
        { ...queryOpts, return: "array" },
        { devel: { id, t, onFinish } },
      );

      // @ts-expect-error: we're testing for mistakes.
      expect(result.timestamp).not.toBeDefined();

      expect(result.quotes).toBeType("array");
      expect(result.quotes[0]).toBeType("object");
      expect(result.quotes[0].high).toBeType("number");

      expect(result.events).toBeType("object");
      expect(result.events!.dividends).toBeType("array");
      expect(result.events!.dividends![0]).toBeType("object");
      expect(result.events!.dividends![0].amount).toBeType("number");

      expect(result.events!.splits).toBeType("array");
      expect(result.events!.splits![0]).toBeType("object");
      expect(result.events!.splits![0].numerator).toBeType("number");
    });

    it("object", async (t, onFinish) => {
      const result = await yf.chart(
        symbol,
        { ...queryOpts, return: "object" },
        { devel: { id, t, onFinish } },
      );

      expect(result.timestamp).toBeType("array");
      expect(result.timestamp![0]).toBeType("number");

      expect(result.events!.dividends).toBeType("object");
      expect(result.events!.splits).toBeType("object");

      expect(result.indicators.quote).toBeType("array");
      expect(result.indicators.quote[0]).toBeType("object");
      expect(result.indicators.quote[0].high).toBeType("array");
      expect(result.indicators.quote[0].high[0]).toBeType("number");

      expect(result.indicators.adjclose).toBeType("array");
      expect(result.indicators.adjclose![0]).toBeType("object");
      expect(result.indicators.adjclose![0].adjclose).toBeType("array");
      expect(result.indicators.adjclose![0].adjclose![0]).toBeType("number");
    });
  });
});
