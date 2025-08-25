import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
  spyLogger,
  testSymbols,
} from "../../tests/common.ts";

import quoteSummary, { type QuoteSummaryModules } from "./quoteSummary.ts";

const YahooFinance = createTestYahooFinance({ modules: { quoteSummary } });
const logger = spyLogger();
const yf = new YahooFinance({ logger });

interface itValidatesOpts {
  skip?: Array<string>;
}

function itValidates(
  name: QuoteSummaryModules | "all",
  opts: itValidatesOpts = {},
) {
  let symbols = testSymbols({
    add: [
      // incomeStatementHistory/sellingGeneralAdministrative is null (#258)
      // "Got {}->null for 'number', did you want 'number | null' ?"
      "CMCOM.AS",
      "CRM",
      "ADA-USD", // has summaryProfile.twitter (#418),
      "EREGL.IS", // null in incomeStatementHistory/operatingIncome, in some .IS (#517)
      "THYAO.IS", // (#517)
      "HISU-U.TO", // topHoldings: missing StockPosition, bondPosition (#639)
      // "EURN", // secFilings: missing some filing types (#664) // delisted
      "ARMK", // secFilings: missing some filing types (#664)
    ],
    skip: [
      // Removed, since it now has a value like { "trailingAnnualDividendYield": "NaN" }
      // (yes, as a string :)) which we really do want to fail validation on!
      "AFRAF",
    ],
  });

  if (opts.skip) {
    symbols = symbols.filter((s) => !opts.skip!.includes(s));
  }

  const modules = name === "all" ? "all" : [name];
  it.each(symbols)("validates %s", async (symbol, t, onFinish) => {
    const devel = { id: `quoteSummary-${name}-${symbol}`, t, onFinish };
    try {
      await yf.quoteSummary(symbol, { modules }, { devel });
    } catch (error) {
      if (
        // TypeScript 4.4.4 assumes errors are `unknown`, need to type guard.
        error instanceof Error &&
        error.message.match(/^No fundamentals data found/)
      ) {
        return;
      }
      throw error;
    }
  });
}

describe("quoteSummary", () => {
  setupCache();

  describe("quoteSummary", () => {
    // See also common module tests in moduleExec.spec.js

    /* TODO
    if (PERFORM_FAKE_TESTS) {
      it("throws on invalid result", async () => {
        await expect(
          yf.quoteSummary("AAPL", {}, { devel: "weirdJsonResult.fake.json" }),
        ).rejects.toThrow(/Unexpected result/);
      });
    }
    */
  });

  describe("modules", () => {
    it("deprecations", async (t, onFinish) => {
      const logger = spyLogger();
      const yahooFinance = new YahooFinance({ logger });
      await yahooFinance.quoteSummary("AAPL", {
        modules: ["balanceSheetHistory"],
      }, {
        devel: { id: "quoteSummary-balanceSheetHistory-AAPL", t, onFinish },
      });
      expect(logger.warn.calls[0].args[0].match(/fundamentalsTimeSeries/))
        .not.toBeNull();
    });

    describe("assetProfile", () => {
      itValidates("assetProfile");
    });

    describe("balanceSheetHistory", () => {
      itValidates("balanceSheetHistory");
    });

    describe("balanceSheetHistoryQuarterly", () => {
      itValidates("balanceSheetHistoryQuarterly");
    });

    describe("calendarEvents", () => {
      itValidates("calendarEvents");
    });

    describe("cashflowStatementHistory", () => {
      itValidates("cashflowStatementHistory");
    });

    describe("cashflowStatementHistoryQuarterly", () => {
      itValidates("cashflowStatementHistoryQuarterly");
    });

    describe("defaultKeyStatistics", () => {
      itValidates("defaultKeyStatistics");
    });

    describe("earnings", () => {
      itValidates("earnings");
    });

    describe("earningsHistory", () => {
      itValidates("earningsHistory");
    });

    describe("earningsTrend", () => {
      itValidates("earningsTrend");
    });

    describe("financialData", () => {
      itValidates("financialData");
    });

    describe("fundOwnership", () => {
      itValidates("fundOwnership");
    });

    describe("incomeStatementHistory", () => {
      itValidates("incomeStatementHistory");
    });

    describe("incomeStatementHistoryQuarterly", () => {
      itValidates("incomeStatementHistoryQuarterly");
    });

    describe("indexTrend", () => {
      itValidates("indexTrend");
    });

    describe("industryTrend", () => {
      itValidates("industryTrend");
    });

    describe("insiderHolders", () => {
      itValidates("insiderHolders");
    });

    describe("insiderTransactions", () => {
      itValidates("insiderTransactions");
    });

    describe("institutionOwnership", () => {
      itValidates("institutionOwnership");
    });

    describe("majorDirectHolders", () => {
      itValidates("majorDirectHolders");
    });

    describe("majorHoldersBreakdown", () => {
      itValidates("majorHoldersBreakdown");
    });

    describe("netSharePurchaseActivity", () => {
      itValidates("netSharePurchaseActivity");
    });

    describe("price", () => {
      itValidates("price");
    });

    describe("quoteType", () => {
      itValidates("quoteType");
    });

    describe("recommendationTrend", () => {
      itValidates("recommendationTrend");
    });

    describe("secFilings", () => {
      itValidates("secFilings");

      it("handles AAPL's secFilings", async (t, onFinish) => {
        await yf.quoteSummary(
          "AAPL",
          {
            modules: ["secFilings"],
          },
          { devel: { id: "quoteSummary-secFilings-AAPL-new", t, onFinish } },
        );
      });
    });

    describe("summaryDetail", () => {
      itValidates("summaryDetail");
    });

    describe("summaryProfile", () => {
      itValidates("summaryProfile");
    });

    describe("upgradeDowngradeHistory", () => {
      itValidates("upgradeDowngradeHistory");
    });
  }); /* modules */

  describe("all modules at once", () => {
    // Some modules change the output format of other modules!
    itValidates("all");
  });

  // Output can differ depending on the combination of modules.
  describe("other combinations", () => {
    it("handles BMW.DE module combinations", async (t, onFinish) => {
      await yf.quoteSummary(
        "BMW.DE",
        {
          modules: [
            "price",
            "assetProfile",
            "incomeStatementHistory",
            "incomeStatementHistoryQuarterly",
            "balanceSheetHistory",
            "balanceSheetHistoryQuarterly",
            "cashflowStatementHistory",
            "cashflowStatementHistoryQuarterly",
            "quoteType",
            "financialData",
            "defaultKeyStatistics",
            "earnings",
            "earningsHistory",
            "earningsTrend",
            "calendarEvents",
            "summaryDetail",
            "summaryProfile",
          ],
        },
        { devel: { id: "quoteSummary-other-BMW.DE", t, onFinish } },
      );
    });
  });
});
