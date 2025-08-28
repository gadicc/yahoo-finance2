import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
  testSymbols,
} from "../../tests/common.ts";

import recommendationsBySymbol from "./recommendationsBySymbol.ts";

const YahooFinance = createTestYahooFinance({
  modules: { recommendationsBySymbol },
});
const yf = new YahooFinance();

describe("recommendationsBySymbol", () => {
  setupCache();

  // make sure it passes validation for some symbols
  describe("passes validation", () => {
    const symbols = testSymbols({
      skip: [
        // 404 Not Found
        "ADH",
        "BTC-USD",
        "GC=F",
        "APS.AX",
      ],
    });

    it.each(symbols)("for symbol '%s'", async (symbol, t, onFinish) => {
      const devel = { id: `recommendationsBySymbol-${symbol}`, t, onFinish };
      await yf.recommendationsBySymbol(symbol, {}, { devel });
    });
  });

  // make sure it passes validation for multiple symbols
  it(
    `passes validation for multiple symbols ("AAPL" and "BMW.DE")`,
    async (t, onFinish) => {
      const devel = { id: `recommendationsBySymbol-AAPL-BMW.DE`, t, onFinish };
      await yf.recommendationsBySymbol(["AAPL", "BMW.DE"], {}, { devel });
    },
  );

  it("returns an array for an array", async (t, onFinish) => {
    const devel = { id: "recommendationsBySymbol-AAPL-BMW.DE", t, onFinish };
    const results = await yf.recommendationsBySymbol(
      ["AAPL", "BMW.DE"],
      {},
      { devel },
    );
    expect(results.length).toBe(2);
    expect(results[0].symbol).toBe("AAPL");
    expect(results[1].symbol).toBe("BMW.DE");
  });

  it("returns single for a string", async (t, onFinish) => {
    const devel = { id: "recommendationsBySymbol-AAPL", t, onFinish };
    const result = await yf.recommendationsBySymbol("AAPL", {}, { devel });
    expect(Array.isArray(result)).toBe(false);
    expect(result.symbol).toBe("AAPL");
  });

  it("throws on weird result", (t, onFinish) => {
    const devel = { id: "weirdJsonResult.fake", t, onFinish };
    return expect(
      yf.recommendationsBySymbol("AAPL", {}, { devel }),
    ).rejects.toThrow(/^Unexpected result/);
  });
});
