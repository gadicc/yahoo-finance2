import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
  testSymbols,
} from "../../tests/common.ts";

import quote from "./quote.ts";

const YahooFinance = createTestYahooFinance({ modules: { quote } });
const yf = new YahooFinance();

/*
const marketStates = [
  "PREPRE",
  "CLOSED",
  "PRE",
  "REGULAR",
  "POSTPOST",
  //"POST" -- missing test!
];
*/

describe("quote", () => {
  setupCache();

  const symbols = testSymbols({
    add: [
      "AZT.OL", // Far less properties than other symbols (#42)
      "AAPL220121C00025000", // Option
      "LDO.MI", // additionalProperty: underlyingSymbol (#363)
      "ZRC-USD", // Low cap crypto (#403)
      "SOHO", // "openInterest" prop (#445)
      "VWRL.L", // ETF with no dividendYield, expenseRatio (#914)
      "ZGLD.SW", // ETF with no netAssets (#916)
      "B0K25.NYM", // FUTURE with no `headSymbolAsString` (#917)
      "ZNC=F", // ALTSYMBOL (#946)
      "NZ", // ECNQUOTE (#464)
      "NIK", // ECNQUOTE (#464)
    ],
  });

  /*
  const ticker = "ZRC-USD";
  it(`single test for ticker ${ticker}`, async () => {
    const devel = `quote-${ticker}.json`;
    const result = await yf.quote(ticker, {}, { devel });
    expect(result.symbol).toBe(ticker);
  });
  */

  describe("passes validation", () => {
    it.each(symbols)("for symbol '%s'", async (symbol, t, onFinish) => {
      const devel = { id: `quote-${symbol}`, t, onFinish };
      await yf.quote(symbol, {}, { devel });
    });

    // TODO, what was this test? `:)  need to find original commmit for it.
    // Doesn't look like it does anything at all?
    /*
    it.each(marketStates)("for marketState %s", async (state) => {
      const devel = `quote-marketState-${state}.fake.json`;
      await yf.quote("fake", {}, { devel });
    });
    */
  });

  it("allows blank options", async (t, onFinish) => {
    await expect(() => {
      const devel = { id: "quote-AAPL", t, onFinish };
      yf.quote("AAPL", undefined, { devel });
    }).not.toThrow();
  });

  it("returns an array for an array", async (t, onFinish) => {
    const devel = { id: "quote-AAPL-BABA", t, onFinish };
    const results = await yf.quote(["AAPL", "BABA"], {}, { devel });
    expect(results.length).toBe(2);
    expect(results[0].symbol).toBe("AAPL");
    expect(results[1].symbol).toBe("BABA");
  });

  it("returns single for a string", async (t, onFinish) => {
    const devel = { id: "quote-AAPL", t, onFinish };
    const result = await yf.quote("AAPL", {}, { devel });
    expect(Array.isArray(result)).toBe(false);
    expect(result.symbol).toBe("AAPL");
  });

  it("throws on unexpected result", async (t, onFinish) => {
    const devel = { id: "weirdJsonResult.fake", t, onFinish };
    await expect(
      yf.quote("AAPL", {}, { devel }),
    ).rejects.toThrow(/Unexpected result/);
  });

  it("passes through single ?fields", async (t, onFinish) => {
    const devel = { id: "quote-TSLA-fields-symbol", t, onFinish };
    const queryOpts = { fields: ["symbol"] };
    const result = await yf.quote("TSLA", queryOpts, { devel });
    expect(result.symbol).toBe("TSLA");
    expect(result.displayName).not.toBeDefined();
  });

  it("passes through multiple ?fields", async (t, onFinish) => {
    const devel = { id: "quote-TSLA-fields-symbol-shortName", t, onFinish };
    const queryOpts = { fields: ["symbol", "displayName"] };
    const result = await yf.quote("TSLA", queryOpts, { devel });
    expect(result.symbol).toBe("TSLA");
    expect(result.displayName).toBeDefined();
  });

  // TODO, more generic "customFields" test?  What else is there?
  it("passes through companyLogoUrl field", async (t, onFinish) => {
    const devel = { id: "quote-TSLA-fields-companyLogoUrl", t, onFinish };
    const queryOpts = { fields: ["symbol", "companyLogoUrl"] };
    const result = await yf.quote("TSLA", queryOpts, { devel });
    expect(result.symbol).toBe("TSLA");
    expect(result.companyLogoUrl).toBeDefined();
    expect(result.logoUrl).toBeDefined();
  });

  describe("return type", () => {
    it("array", async (t, onFinish) => {
      const devel = { id: "quote-AAPL-BABA", t, onFinish };
      const results = await yf.quote(
        ["AAPL", "BABA"],
        { return: "array" },
        { devel },
      );
      expect(results.length).toBe(2);
      expect(results[0].symbol).toBe("AAPL");
      expect(results[1].symbol).toBe("BABA");
    });

    it("object", async (t, onFinish) => {
      const devel = { id: "quote-AAPL-BABA", t, onFinish };
      const results = await yf.quote(
        ["AAPL", "BABA"],
        { return: "object" },
        { devel },
      );
      expect(Object.keys(results).length).toBe(2);
      expect(results.AAPL.symbol).toBe("AAPL");
      expect(results.BABA.symbol).toBe("BABA");
    });

    it("map", async (t, onFinish) => {
      const devel = { id: "quote-AAPL-BABA", t, onFinish };
      const results = await yf.quote(
        ["AAPL", "BABA"],
        { return: "map" },
        { devel },
      );
      expect(results.size).toBe(2);
      expect(results.get("AAPL")?.symbol).toBe("AAPL");
      expect(results.get("BABA")?.symbol).toBe("BABA");
    });
  });

  describe('{ quoteType: "NONE" }', () => {
    it("returns undefined on single result", async (t, onFinish) => {
      const devel = { id: "quote-BRKS", t, onFinish };
      const result = await yf.quote("BRKS", {}, { devel });
      expect(result).toBe(undefined);
    });
  });

  it("passes through beta field option", async (t, onFinish) => {
    const devel = { id: "quote-MSFT-fields-beta", t, onFinish };
    const queryOpts = { fields: ["beta"] };
    const result = await yf.quote("MSFT", queryOpts, { devel });
    expect(result.symbol).toBe("MSFT");
    expect(result.beta).toBeDefined();
  });

  describe("extended market fields", () => {
    it("passes through extendedMarket fields", async (t, onFinish) => {
      const devel = { id: "quote-AAPL-fields-extendedMarket", t, onFinish };
      const queryOpts = {
        fields: [
          "symbol",
          "extendedMarketChange",
          "extendedMarketChangePercent",
          "extendedMarketPrice",
          "extendedMarketTime",
        ],
      };
      const result = await yf.quote("AAPL", queryOpts, { devel });
      expect(result.symbol).toBe("AAPL");
      // These fields may not always be present depending on market state
      // but should pass validation when they are
    });

    it("passes through day-level fields", async (t, onFinish) => {
      const devel = { id: "quote-AAPL-fields-dayLevel", t, onFinish };
      const queryOpts = {
        fields: ["symbol", "dayHigh", "dayLow", "volume"],
      };
      const result = await yf.quote("AAPL", queryOpts, { devel });
      expect(result.symbol).toBe("AAPL");
      // These fields may include extended hours data
    });
  });
});
