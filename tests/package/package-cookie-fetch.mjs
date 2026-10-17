// Synthetic installed-package data only. Every unrecognized request fails closed.
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";

const phase = process.env.YF_COOKIE_PROBE_PHASE;
const log = process.env.YF_COOKIE_PROBE_LOG;
assert(log && phase, "Explicit synthetic cookie probe controls required");
const expectedCookies = {
  "cli-write": { A1: "packed-cookie" },
  "cli-read": { A1: "packed-cookie", CLI: "cli-persisted" },
  "mcp-write": { A1: "packed-cookie", CLI: "cli-persisted" },
  "cli-read-mcp": {
    A1: "packed-cookie",
    CLI: "cli-persisted",
    MCP: "mcp-persisted",
  },
  "invalid-result": {
    A1: "packed-cookie",
    CLI: "cli-persisted",
    MCP: "mcp-persisted",
  },
};
assert(Object.hasOwn(expectedCookies, phase), "Unknown cookie probe phase");
// Same minimal validated PACKED quote used by package-consumer.mjs.
const quote = {
  symbol: "PACKED",
  language: "en-US",
  region: "US",
  quoteType: "EQUITY",
  triggerable: false,
  marketState: "REGULAR",
  tradeable: true,
  exchange: "NMS",
  exchangeTimezoneName: "America/New_York",
  exchangeTimezoneShortName: "EDT",
  gmtOffSetMilliseconds: -14400000,
  market: "us_market",
  esgPopulated: false,
  sourceInterval: 15,
  exchangeDataDelayedBy: 0,
  fullExchangeName: "NasdaqGS",
  regularMarketPrice: 123.45,
  regularMarketTime: 1700000000,
};

/** @param {RequestInfo | URL} input @param {RequestInit} [init] */
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(
    url.origin,
    "https://query2.finance.yahoo.com",
    "Unrecognized synthetic request origin",
  );
  assert.equal(
    url.pathname,
    "/v7/finance/quote",
    "Unrecognized synthetic request path",
  );
  assert.equal(url.hash, "");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.deepEqual([...url.searchParams].sort(), [
    ["crumb", "packed-crumb"],
    ["symbols", "PACKED"],
  ]);
  assert.equal(init?.method ?? "GET", "GET");
  assert.equal(init?.body, undefined);
  assert(
    !(input instanceof Request),
    "Synthetic fixture expects the ordinary URL/init call",
  );
  const headers = new Headers(init?.headers);
  assert(!headers.has("authorization"));
  const cookieEntries = (headers.get("cookie") ?? "")
    .split(/;\s*/)
    .filter(Boolean)
    .map((entry) => entry.split("="));
  const cookies = Object.fromEntries(cookieEntries);
  assert.equal(Object.keys(cookies).length, cookieEntries.length);
  assert.deepEqual(
    cookies,
    expectedCookies[/** @type {keyof typeof expectedCookies} */ (phase)],
  );
  appendFileSync(log, `${JSON.stringify({ phase, url: url.href, cookies })}\n`);
  const responseHeaders = new Headers();
  if (phase === "cli-write")
    responseHeaders.set(
      "Set-Cookie",
      "CLI=cli-persisted; Domain=.yahoo.com; Path=/",
    );
  if (phase === "mcp-write")
    responseHeaders.set(
      "Set-Cookie",
      "MCP=mcp-persisted; Domain=.yahoo.com; Path=/",
    );
  return Response.json(
    {
      quoteResponse: {
        result: [
          phase === "invalid-result"
            ? { ...quote, regularMarketPrice: "invalid" }
            : quote,
        ],
        error: null,
      },
    },
    { headers: responseHeaders },
  );
};
