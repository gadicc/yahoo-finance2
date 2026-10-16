import { describe, it } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import YahooFinance from "./index.ts";

describe("YahooFinanceFetch", () => {
  it("inits", () => {
    const yahooFinance = new YahooFinance();
    expect(yahooFinance.autoc).toBeDefined();
  });
});
