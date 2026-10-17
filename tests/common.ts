import { describe, projectIt as it } from "./helpers/runner.ts";
export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
} from "./helpers/runner.ts";
import { expect as _expect } from "./helpers/assertions.ts";
import { getType } from "jest-get-type";
import fetchCache, { fetchCacheSetup } from "./fetchCache.ts";
import { spy } from "./helpers/mock.ts";

import testSymbols from "./testSymbols.ts";
import createYahooFinance from "../src/createYahooFinance.ts";

const FETCH_DEVEL_NOCACHE = process.env["FETCH_DEVEL"] === "nocache";
const FETCH_DEVEL_RECACHE = process.env["FETCH_DEVEL"] === "recache";
const FETCH_DEVEL_RECACHE_CONCURRENCY = Number(
  process.env["FETCH_DEVEL_RECACHE_CONCURRENCY"] ?? 1,
);

function spyLogger(shouldLog = false) {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: Test loggers preserve the existing console-compatible argument contract.
    info: spy((...args: any[]) => shouldLog && console.log(...args)),
    warn: spy(
      // biome-ignore lint/suspicious/noExplicitAny: Test loggers preserve the existing console-compatible argument contract.
      (...args: any[]) => shouldLog && console.warn(555, shouldLog, ...args),
    ),
    // biome-ignore lint/suspicious/noExplicitAny: Test loggers preserve the existing console-compatible argument contract.
    error: spy((...args: any[]) => shouldLog && console.error(...args)),
    // biome-ignore lint/suspicious/noExplicitAny: Test loggers preserve the existing console-compatible argument contract.
    dir: spy((...args: any[]) => shouldLog && console.dir(...args)),
    // biome-ignore lint/suspicious/noExplicitAny: Test loggers preserve the existing console-compatible argument contract.
    debug: spy((..._args: any[]) => shouldLog && console.debug(..._args)),
    // _setShouldLog: (value: boolean) => shouldLog = value,
  };
}

_expect.extend({
  toBeType(value: unknown, expected: ReturnType<typeof getType>) {
    const type = getType(value);
    return {
      pass: type === expected,
      message: () => `Expected "${type}" to be "${expected}"`,
    };
  },
});
const expect = _expect;

const setupCache = fetchCacheSetup;

interface FetchDevelOptions {
  idTransform?: (id: string) => string;
  mode?: "record" | "replay";
}

/**
 * Special wrapper for `fetch()` used for tests.  We already set up
 * `fetch-cache-mock` elsewhere in this file, but this wrapper allows
 * us to call `fetchCache._once()` with additional options before
 * the fetch is executed.
 */
export function fetchDevel(options: FetchDevelOptions = {}) {
  function fetchDevel(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1], // & { devel?: boolean | string },
  ): ReturnType<typeof fetch> {
    // @ts-expect-error: later
    const { devel, ..._init } = init || {};
    // console.log({ devel });
    if (typeof devel === "string") {
      const id =
        options.idTransform?.(devel.replace(/\.json$/, "")) ??
        devel.replace(/\.json$/, "");
      fetchCache.once({
        id,
        ...(/\.(?:static|fake)$/.test(id)
          ? { mode: "replay" as const }
          : options.mode
            ? { mode: options.mode }
            : {}),
      });
    } else if (typeof devel === "object" && "id" in devel) {
      const id = options.idTransform?.(devel.id) ?? devel.id;
      const isStatic = !!devel.id.match(/\.(static|fake)$/);
      if (isStatic) {
        fetchCache.once({ id, mode: "replay" });
      } else if (options.mode) {
        fetchCache.once({ id, mode: options.mode });
      } else if (FETCH_DEVEL_NOCACHE && !isStatic) {
        fetchCache.once({
          id,
          readCache: false,
          writeCache: false,
        });
      } else if (FETCH_DEVEL_RECACHE && !isStatic) {
        // Prepare a `writeCache` for fetchCache that we can resolve elsewhere.
        let resolve: (value: boolean) => void;
        const writeCache: Promise<boolean> = new Promise((_resolve) => {
          resolve = _resolve;
        });

        // `onFinish` is provided by `wrappedIt` above.  It allows us to
        // provide a callback for when the test is finished, with the
        // test status (undefined on pass, actual test error on fail),
        if (devel.onFinish) {
          devel.onFinish((error?: unknown) => {
            // This resolves the `writeCache` promise above.
            // Pass = don't write the cache, fail = write the cache.
            resolve(!!error);
          });
        } else if (devel.id.startsWith("getCrumb-")) {
          // getCrumb specific tests will have onFinish set, but, when calling
          // getCrumb as part of other tests, we don't want to require
          // onFinish to be set.
        } else {
          console.warn(
            "Capture request has no onFinish callback; scheduling capture",
          );
          setTimeout(() => resolve(true), 0);
        }

        fetchCache.once({ id, readCache: false, writeCache });
      } else {
        fetchCache.once({ id });
      }
    } else {
      throw new Error("unexpected fetchDevel value: " + JSON.stringify(devel));
    }

    return fetch(input, init);
  }
  return fetchDevel;
}

/**
 * Like `createYahooFinance` but with some common settings for testing,
 * e.g. `disallowAdditionalProps`
 * @param opts
 * @returns
 */
export function createTestYahooFinance<
  T extends Parameters<typeof createYahooFinance>[0],
>(opts: T): ReturnType<typeof createYahooFinance<T>> {
  const recacheQueue = FETCH_DEVEL_RECACHE
    ? {
        queue: {
          concurrency: FETCH_DEVEL_RECACHE_CONCURRENCY,
          // Pace actual network fetches in fetchCache, so replay remains fast.
          interval: 0,
        },
      }
    : {};

  return createYahooFinance({
    _allowAdditionalProps: false,
    _opts: { suppressNotices: ["yahooSurvey"], ...recacheQueue },
    ...opts,
    modules: { ...opts.modules },
    fetchDevel,
  });
}

export { testSymbols };
export { spyLogger };
export { fetchCache, fetchCacheSetup, setupCache };
export { describe, expect, it, spy };
