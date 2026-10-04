"use strict";

import { spy } from "@std/testing/mock";
import { afterAll, beforeAll } from "@std/testing/bdd";

// XXX TODO npm?
// import createFetchCache from "fetch-mock-cache/lib/runtimes/deno.ts";
// import Store from "fetch-mock-cache/lib/stores/fs.ts";
import createFetchCache from "@gadicc/fetch-mock-cache/runtimes/deno.ts";
import Store from "@gadicc/fetch-mock-cache/stores/fs.ts";
import { createRecacheFetch } from "./recacheFetch.ts";
import { RECACHE_STATS_PREFIX } from "./recacheStats.ts";

const originalFetch = globalThis.fetch;
// Behavior tests may stub console. The parent must still see counters and the
// fatal rate-limit marker, even if the current test catches the fetch error.
const recacheLog = console.log.bind(console);
const recacheError = console.error.bind(console);
const recaching = Deno.env.get("FETCH_DEVEL") === "recache";
const recacheFetch = recaching
  ? createRecacheFetch(
    originalFetch,
    Number(Deno.env.get("FETCH_DEVEL_RECACHE_INTERVAL") ?? 3000),
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
  fetch: recacheFetch ?? originalFetch,
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
