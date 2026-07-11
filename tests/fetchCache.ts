"use strict";

import { spy } from "@std/testing/mock";
import { afterAll, beforeAll } from "@std/testing/bdd";

// XXX TODO npm?
// import createFetchCache from "fetch-mock-cache/lib/runtimes/deno.ts";
// import Store from "fetch-mock-cache/lib/stores/fs.ts";
import createFetchCache from "@gadicc/fetch-mock-cache/runtimes/deno.ts";
import Store from "@gadicc/fetch-mock-cache/stores/fs.ts";

const fetchCache = createFetchCache({
  Store,
  // Cached Set-Cookie headers rebuild the cookie jar during replay. Preserve
  // those while retaining the default redaction policy for request headers.
  redactResponseHeaders: [
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-api-key",
  ],
});
const originalFetch = globalThis.fetch;

function fetchCacheSetup() {
  beforeAll(() => {
    globalThis.fetch = spy(fetchCache);
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
}

export { fetchCacheSetup };
export default fetchCache;
