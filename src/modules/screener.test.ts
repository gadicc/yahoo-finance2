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

  // TODO - Add reset of predefined screener responses
  it.each([
    "aggressive_small_caps",
    "conservative_foreign_funds",
    "day_gainers",
    "day_losers",
    "growth_technology_stocks",
  ])(
    "passes validation for predefined screener '%s'",
    async (predefined_screener, t, onFinish) => {
      await yf.screener(
        { scrIds: predefined_screener, count: 20 },
        {
          devel: { id: `screener-${predefined_screener}`, t, onFinish },
        },
      );
    },
  );

  // Test for using just the screener name as an argument w/o options obj
  it.each(["aggressive_small_caps"])(
    "passes validation for predefined screener '%s'",
    async (predefined_screener, t, onFinish) => {
      await yf.screener(
        predefined_screener,
        {
          devel: { id: `screener-${predefined_screener}`, t, onFinish },
        },
      );
    },
  );

  it("throws on weird result", (t, onFinish) => {
    const devel = { id: "weirdJsonResult.fake", t, onFinish };
    return expect(
      yf.screener({ scrIds: "aggressive_small_caps" }, { devel }),
    ).rejects.toThrow(/^Unexpected result/);
  });
});
