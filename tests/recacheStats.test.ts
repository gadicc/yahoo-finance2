import { expect } from "@std/expect";
import {
  formatRecacheStats,
  mergeRecacheStats,
  parseRecacheStats,
  RECACHE_STATS_PREFIX,
  recacheEndpoint,
} from "./recacheStats.ts";

Deno.test("recache endpoint counts combine symbols without exposing query credentials", () => {
  expect(
    recacheEndpoint(
      new URL(
        "https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL?crumb=secret&modules=price",
      ),
    ),
  )
    .toBe("query2.finance.yahoo.com/v10/finance/quoteSummary/:symbol");
  expect(
    recacheEndpoint(
      new URL(
        "https://query2.finance.yahoo.com/v10/finance/quoteSummary/MSFT?crumb=other",
      ),
    ),
  )
    .toBe("query2.finance.yahoo.com/v10/finance/quoteSummary/:symbol");
});

Deno.test("recache counts aggregate files while preserving HTTP and network outcomes", () => {
  const rows = mergeRecacheStats([
    [{
      endpoint: "query2.finance.yahoo.com/v7/finance/quote",
      requests: 2,
      reused: 3,
      statuses: { "200": 1, "429": 1 },
    }],
    [{
      endpoint: "query2.finance.yahoo.com/v7/finance/quote",
      requests: 1,
      reused: 2,
      statuses: { networkError: 1 },
    }],
  ]);
  expect(rows).toEqual([{
    endpoint: "query2.finance.yahoo.com/v7/finance/quote",
    requests: 3,
    reused: 5,
    statuses: { "200": 1, "429": 1, networkError: 1 },
  }]);
  expect(formatRecacheStats(rows)).toContain(
    "Total: 3 network attempts; 5 requests reused.",
  );
  expect(parseRecacheStats(RECACHE_STATS_PREFIX + JSON.stringify(rows)))
    .toEqual(rows);
  expect(parseRecacheStats("ordinary test output")).toBeUndefined();
  expect(parseRecacheStats(RECACHE_STATS_PREFIX + '{"broken":true}'))
    .toBeUndefined();
  expect(
    parseRecacheStats(
      RECACHE_STATS_PREFIX +
        '[{"endpoint":"quote","requests":-1,"reused":0,"statuses":{}}]',
    ),
  ).toBeUndefined();
});
