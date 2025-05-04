import {
  createTestYahooFinance,
  describe,
  it,
  setupCache,
  testSymbols,
} from "../../tests/common.ts";

import search from "./search.ts";

const YahooFinance = createTestYahooFinance({ modules: { search } });
const yf = new YahooFinance();

describe("search", () => {
  setupCache();

  // See also common module tests in moduleExec.spec.js

  const testSearches = testSymbols({
    add: [
      "Evolution Gaming Group", // STO
      "Bayerische Motoren Werke AG", // GER
      "NO0010123060", // has no shortname! (#31)
      "EUR", // a currency
      "BJ0CDD2", // additionalProperty: { exchDisp: "London" }
      'RAMXX', // a money market
    ],
  });

  // validate different searches
  it.each(testSearches)(
    "passed validation for search '%s'",
    async (testSearch) => {
      const devel = `search-${testSearch}.json`;
      await yf.search(testSearch, {}, { devel });
    },
  );
});
