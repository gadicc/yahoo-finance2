"use strict";

import { spy } from "./migration/mock.ts";
import { afterAll, beforeAll } from "./migration/runner.ts";

import createFetchCache from "fetch-mock-cache/runtimes/bun.ts";
import ReplayStore from "./replayStore.ts";
import { isNativeReplay } from "../scripts/testing/native.ts";
import { createRecacheFetch } from "./recacheFetch.ts";
import { RECACHE_STATS_PREFIX } from "./recacheStats.ts";
import { captureSession } from "../scripts/recache/session.ts";
import { captureStore } from "../scripts/recache/store.ts";

const originalFetch = globalThis.fetch;
const offlineFetch: typeof fetch = () => {
  throw new Error("Offline replay forbids network fetch");
};
const session = captureSession();
if (isNativeReplay() && session) throw new Error("Native replay cannot capture fixtures");
if (!session && (process.env.FMC_CACHE_MODE !== "replay" || process.env.FETCH_DEVEL)) {
  throw new Error(
    "Runner experiments require FMC_CACHE_MODE=replay and cleared FETCH_DEVEL",
  );
}
// Behavior tests may stub console. The parent must still see counters and the
// fatal rate-limit marker, even if the current test catches the fetch error.
const recacheLog = console.log.bind(console);
const recacheError = console.error.bind(console);
const recaching = !!session && session.mode !== "geo-replay";
const storage = session ? captureStore(session) : undefined;
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
  Store: storage?.Store ?? ReplayStore,
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
  afterAll(async () => {
    globalThis.fetch = originalFetch;
    try {
      await storage?.drain();
    } finally {
      reportRecacheStats();
    }
  });
}

export { fetchCacheSetup };
export default fetchCache;
