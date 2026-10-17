import { describe, it } from "../tests/helpers/runner.ts";
import { expect } from "../tests/helpers/assertions.ts";
import YahooFinance from "./index.ts";

describe("YahooFinanceFetch", () => {
  it("inits", () => {
    const yahooFinance = new YahooFinance();
    expect(yahooFinance.autoc).toBeDefined();
  });
});
