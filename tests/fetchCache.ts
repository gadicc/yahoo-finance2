"use strict";

import { spy } from "./migration/mock.ts";
import { afterAll, beforeAll } from "./migration/runner.ts";

// XXX TODO npm?
// import createFetchCache from "fetch-mock-cache/lib/runtimes/deno.ts";
// import Store from "fetch-mock-cache/lib/stores/fs.ts";
import createFetchCache from "fetch-mock-cache/runtimes/node.ts";
import Store from "fetch-mock-cache/stores/fs.ts";
import { createRecacheFetch } from "./recacheFetch.ts";
import { RECACHE_STATS_PREFIX } from "./recacheStats.ts";

const originalFetch = globalThis.fetch;
const offlineFetch: typeof fetch = () => {
  throw new Error("Offline replay forbids network fetch");
};
if (process.env.FMC_CACHE_MODE !== "replay" || process.env.FETCH_DEVEL) {
  throw new Error(
    "Runner experiments require FMC_CACHE_MODE=replay and cleared FETCH_DEVEL",
  );
}
// Behavior tests may stub console. The parent must still see counters and the
// fatal rate-limit marker, even if the current test catches the fetch error.
const recacheLog = console.log.bind(console);
const recacheError = console.error.bind(console);
const recaching = process.env["FETCH_DEVEL"] === "recache";
const recacheFetch = recaching
  ? createRecacheFetch(
    originalFetch,
    Number(process.env["FETCH_DEVEL_RECACHE_INTERVAL"] ?? 3000),
    undefined,
    (error) => {
      // Emit counters before the abort signal so SIGKILL cannot lose this file.
      reportRecacheStats();
      recacheError(error.message);
    },
  )
  : undefined;

function reportRecacheStats() {
  if (recacheFetch) {
    recacheLog(RECACHE_STATS_PREFIX + JSON.stringify(recacheFetch.getStats()));
  }
}

const fetchCache = createFetchCache({
  Store,
  // Wrap the network fetch inside the cache so replay is neither delayed nor
  // aborted, and a live 429 is rejected before fetch-mock-cache can store it.
  fetch: recacheFetch ?? offlineFetch,
  // Cached Set-Cookie headers rebuild the cookie jar during replay. Preserve
  // those while retaining the default redaction policy for request headers.
  redactResponseHeaders: [
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-api-key",
  ],
});

function fetchCacheSetup() {
  beforeAll(() => {
    globalThis.fetch = spy(fetchCache);
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
    reportRecacheStats();
  });
}

export { fetchCacheSetup };
export default fetchCache;
