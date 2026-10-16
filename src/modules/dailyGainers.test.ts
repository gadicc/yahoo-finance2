import { describe, expect, it } from "../../tests/common.ts";
import dailyGainers from "./dailyGainers.ts";

describe("dailyGainers", () => {
  it("dailyGainers always throws deprecation error", () => {
    expect(() => dailyGainers()).toThrow(
      "dailyGainers module has been deprecated",
    );
  });

  it("dailyGainers error suggests screener migration", () => {
    expect(() => dailyGainers()).toThrow("screener({ scrIds: 'day_gainers' })");
  });
});
