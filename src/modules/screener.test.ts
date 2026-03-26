import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
} from "../../tests/common.ts";
import screener from "./screener.ts";

const YahooFinance = createTestYahooFinance({ modules: { screener } });
const yf = new YahooFinance();

describe("screener", () => {
  setupCache();

  it.each([
    "aggressive_small_caps",
    "conservative_foreign_funds",
    "day_gainers",
    "day_losers",
    "growth_technology_stocks",
    "high_yield_bond",
    "most_actives",
    "most_shorted_stocks",
    "portfolio_anchors",
    "small_cap_gainers",
    "solid_large_growth_funds",
    "solid_midcap_growth_funds",
    "top_mutual_funds",
    "undervalued_growth_stocks",
    "undervalued_large_caps",
  ])(
    "passes validation for predefined screener '%s'",
    async (predefined_screener, t, onFinish) => {
      await yf.screener(
        { scrIds: predefined_screener, count: 20 },
        undefined,
        {
          devel: { id: `screener-${predefined_screener}`, t, onFinish },
        },
      );
    },
  );

  it("supports pagination with start option", async (t, onFinish) => {
    await yf.screener(
      { scrIds: "most_actives", count: 5, start: 5 },
      undefined,
      {
        devel: { id: "screener-most_actives", t, onFinish },
      },
    );
  });

  // Test for using just the screener name as an argument w/o options obj
  it.each(["aggressive_small_caps"])(
    "passes validation for predefined screener '%s'",
    async (predefined_screener, t, onFinish) => {
      await yf.screener(
        predefined_screener,
        undefined,
        {
          devel: { id: `screener-${predefined_screener}`, t, onFinish },
        },
      );
    },
  );

  it("throws on weird result", (t, onFinish) => {
    const devel = { id: "weirdJsonResult.fake", t, onFinish };
    return expect(
      yf.screener({ scrIds: "aggressive_small_caps" }, undefined, { devel }),
    ).rejects.toThrow(/^Unexpected result/);
  });
});
