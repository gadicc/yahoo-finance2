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

  it("normalizes listing dates and preserves successful omission", async () => {
    // Reuse a successful response, with stable values for this regression.
    // Stub the transport so recaching cannot replace the semantic test case.
    const fixture = JSON.parse(
      await Deno.readTextFile(
        new URL(
          "../../tests/fixtures/http/screener-small_cap_gainers.json",
          import.meta.url,
        ),
      ),
    );
    const response = fixture.response.bodyJson;
    const rawResult = response.finance.result[0];
    const rawQuote = rawResult.quotes[0];
    delete rawQuote.newListingDate;
    rawResult.quotes = [
      { ...rawQuote, newListingDate: "2026-10-15" },
      { ...rawQuote },
    ];
    rawResult.count = 2;
    const localYf = new YahooFinance();
    localYf._fetch = () => Promise.resolve(response);

    const result = await localYf.screener("small_cap_gainers");
    expect(result.quotes[0].newListingDate).toBeInstanceOf(Date);
    expect(result.quotes[0].newListingDate?.toISOString())
      .toBe("2026-10-15T00:00:00.000Z");
    expect(result.quotes[1].newListingDate).toBeUndefined();
  });

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
