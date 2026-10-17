import { describe, expect, it } from "../../tests/common.ts";
import dailyLosers from "./dailyLosers.ts";

describe("dayLosers", () => {
  it("dailyLosers always throws deprecation error", () => {
    expect(() => dailyLosers()).toThrow(
      "dailyLosers module has been deprecated",
    );
  });

  it("dailyLosers error suggests screener migration", () => {
    expect(() => dailyLosers()).toThrow("screener({ scrIds: 'day_losers' })");
  });
});
