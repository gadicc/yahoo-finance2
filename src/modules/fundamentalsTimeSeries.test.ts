import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
  spyLogger,
  testSymbols,
} from "../../tests/common.ts";

import fundamentalsTimeSeries from "./fundamentalsTimeSeries.ts";

const YahooFinance = createTestYahooFinance({
  modules: { fundamentalsTimeSeries },
});
const yf = new YahooFinance();

describe("fundamentalsTimeSeries", () => {
  setupCache();

  const symbols = testSymbols();

  it.each(symbols)(
    "passes validation for symbol '%s'",
    async (symbol, t, onFinish) => {
      await yf.fundamentalsTimeSeries(
        symbol,
        {
          period1: "2024-01-01",
          period2: "2025-01-01",
          module: "financials",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-${symbol}-financials-quarterly`,
            t,
            onFinish,
          },
        },
      );
      // console.log(`${symbol} fetched ${res.length} reports.`);
    },
  );

  it("passes validation with module all & quarterly", async (t, onFinish) => {
    const res = await yf.fundamentalsTimeSeries(
      "AAPL",
      {
        type: "quarterly",
        period1: "2024-01-01",
        period2: "2025-01-01",
        module: "all",
      },
      {
        devel: { id: `fundamentalsTimeSeries-AAPL-all-quarterly`, t, onFinish },
      },
    );
    expect(res).toHaveLength(4);
  });

  it(
    "passes validation with module financials & quarterly",
    async (t, onFinish) => {
      const res = await yf.fundamentalsTimeSeries(
        "AAPL",
        {
          type: "quarterly",
          period1: "2024-01-01",
          period2: "2025-01-01",
          module: "financials",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-AAPL-financials-quarterly`,
            t,
            onFinish,
          },
        },
      );
      expect(res).toHaveLength(4);
      expect(res[0]).toHaveProperty("totalRevenue");
    },
  );

  it(
    "passes validation with module balance-sheet & quarterly",
    async (t, onFinish) => {
      const res = await yf.fundamentalsTimeSeries(
        "AAPL",
        {
          type: "quarterly",
          period1: "2024-01-01",
          period2: "2025-01-01",
          module: "balance-sheet",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-AAPL-balance-sheet-quarterly`,
            t,
            onFinish,
          },
        },
      );
      expect(res).toHaveLength(4);
      expect(res[0]).toHaveProperty("netDebt");
    },
  );

  it(
    "passes validation with module cash-flow & quarterly",
    async (t, onFinish) => {
      const res = await yf.fundamentalsTimeSeries(
        "AAPL",
        {
          type: "quarterly",
          period1: "2024-01-01",
          period2: "2025-01-01",
          module: "cash-flow",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-AAPL-cash-flow-quarterly`,
            t,
            onFinish,
          },
        },
      );
      expect(res).toHaveLength(4);
      expect(res[0]).toHaveProperty("freeCashFlow");
    },
  );

  it("passes validation with module all & annual", async (t, onFinish) => {
    const res = await yf.fundamentalsTimeSeries(
      "AAPL",
      {
        type: "annual",
        period1: "2022-01-01",
        period2: "2025-01-01",
        module: "all",
      },
      {
        devel: { id: `fundamentalsTimeSeries-AAPL-all-annual`, t, onFinish },
      },
    );
    expect(res).toHaveLength(3);
  });

  it(
    "passes validation with module financials & annual",
    async (t, onFinish) => {
      const res = await yf.fundamentalsTimeSeries(
        "AAPL",
        {
          type: "annual",
          period1: "2022-01-01",
          period2: "2025-01-01",
          module: "financials",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-AAPL-financials-annual`,
            t,
            onFinish,
          },
        },
      );
      expect(res).toHaveLength(3);
      expect(res[0]).toHaveProperty("totalRevenue");
    },
  );

  it(
    "passes validation with module balance-sheet & annual",
    async (t, onFinish) => {
      const res = await yf.fundamentalsTimeSeries(
        "AAPL",
        {
          type: "annual",
          period1: "2022-01-01",
          period2: "2025-01-01",
          module: "balance-sheet",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-AAPL-balance-sheet-annual`,
            t,
            onFinish,
          },
        },
      );
      expect(res).toHaveLength(3);
      expect(res[0]).toHaveProperty("netDebt");
    },
  );

  it(
    "passes validation with module cash-flow & annual",
    async (t, onFinish) => {
      const res = await yf.fundamentalsTimeSeries(
        "AAPL",
        {
          type: "annual",
          period1: "2022-01-01",
          period2: "2025-01-01",
          module: "cash-flow",
        },
        {
          devel: {
            id: `fundamentalsTimeSeries-AAPL-cash-flow-annual`,
            t,
            onFinish,
          },
        },
      );
      expect(res).toHaveLength(3);
      expect(res[0]).toHaveProperty("freeCashFlow");
    },
  );

  it("throws if period1,period2 are the same", async () => {
    await expect(
      yf.fundamentalsTimeSeries("TSLA", {
        period1: "2020-01-01",
        period2: "2020-01-01",
        module: "financials",
      }),
    ).rejects.toThrow(/cannot share the same value/);
  });

  it("throws if period{1,2} gets an invalid string for new Date()", async () => {
    await expect(
      yf.fundamentalsTimeSeries("TSLA", {
        period1: "invalid",
        period2: "2021-01-01",
        module: "financials",
      }),
    ).rejects.toThrow(/invalid date provided/);

    await expect(
      yf.fundamentalsTimeSeries("TSLA", {
        period1: "2020-01-011",
        period2: "invalid",
        module: "financials",
      }),
    ).rejects.toThrow(/invalid date provided/);
  });

  it("throws if invalid type", async () => {
    await expect(
      yf.fundamentalsTimeSeries("TSLA", {
        period1: "2020-01-01",
        period2: "2021-01-01",
        type: "invalid",
        module: "financials",
      }),
    ).rejects.toThrow(/option type invalid/);
  });

  it("throws if invalid module", async () => {
    await expect(
      yf.fundamentalsTimeSeries("TSLA", {
        period1: "2020-01-01",
        period2: "2021-01-01",
        module: "invalid",
      }),
    ).rejects.toThrow(/option module invalid/);
  });

  it("throws if module not set", async () => {
    const logger = spyLogger();
    const yf = new YahooFinance({ logger });

    await expect(
      // @ts-expect-error: intentional invalid options check
      yf.fundamentalsTimeSeries("TSLA", {
        period1: "2020-01-01",
        period2: "2021-01-01",
      }),
    ).rejects.toThrow(/called with invalid options/);
  });

  /*
  it("throws error with unexpected results", (t, onFinish) => {
    return expect(
      yf.fundamentalsTimeSeries(
        "EURGBP=X",
        { period1: 1567728000, period2: 1570665600, module: "financials" },
        {
          devel: {
            id: "fundamentalsTimeSeries-EURGBP-unexpected-results.fake",
            t,
            onFinish,
          },
        },
      ),
    ).rejects.toThrow(/Unexpected result/);
  });
  */
});
