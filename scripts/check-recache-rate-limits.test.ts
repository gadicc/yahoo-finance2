import { expect } from "@std/expect";
import {
  hasRateLimitLog,
  isRateLimitedFixture,
} from "./check-recache-rate-limits.ts";

Deno.test("recache guard catches rate limits in logs even without a written fixture", () => {
  for (
    const log of [
      "Failed to get crumb, status 429, statusText: Too Many Requests",
      "HTTPError: HTTP 429",
      '{"status":429}',
      "status \x1b[31m429\x1b[0m",
      "Too Many Requests",
    ]
  ) {
    expect(hasRateLimitLog(log)).toBe(true);
  }
});

Deno.test("recache guard permits schema drift and unrelated numbers", () => {
  for (
    const log of [
      "Failed Yahoo Schema validation",
      "regularMarketPrice: 429.5",
      "429 tests failed",
      "No data found, status 404",
      "status 4290",
    ]
  ) {
    expect(hasRateLimitLog(log)).toBe(false);
  }
});

Deno.test("recache guard catches a cached 429 even if the log omits it", () => {
  expect(isRateLimitedFixture({ response: { status: 429 } })).toBe(true);
  expect(isRateLimitedFixture({ response: { status: 200 } })).toBe(false);
  expect(isRateLimitedFixture({ response: { status: 404 } })).toBe(false);
  expect(isRateLimitedFixture(null)).toBe(false);
});
