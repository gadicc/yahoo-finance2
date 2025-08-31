import { sprintf } from "@std/fmt/printf";
import { describe, it as _it } from "@std/testing/bdd";
export { afterAll, afterEach, beforeAll, beforeEach } from "@std/testing/bdd";
import { type Async, expect as _expect, type Expected } from "@std/expect";
import type { Global } from "@jest/types";
import { getType } from "jest-get-type";
import fetchCache, { fetchCacheSetup } from "./fetchCache.ts";
import { spy } from "@std/testing/mock";

import testSymbols from "./testSymbols.ts";
import createYahooFinance from "../src/createYahooFinance.ts";

const FETCH_DEVEL_NOCACHE = Deno.env.get("FETCH_DEVEL") === "nocache";
const FETCH_DEVEL_RECACHE = Deno.env.get("FETCH_DEVEL") === "recache";

function spyLogger(shouldLog = false) {
  return {
    // deno-lint-ignore no-explicit-any
    info: spy((...args: any[]) => shouldLog && console.log(...args)),
    // deno-lint-ignore no-explicit-any
    warn: spy((...args: any[]) =>
      shouldLog && console.warn(555, shouldLog, ...args)
    ),
    // deno-lint-ignore no-explicit-any
    error: spy((...args: any[]) => shouldLog && console.error(...args)),
    // deno-lint-ignore no-explicit-any
    dir: spy((...args: any[]) => shouldLog && console.dir(...args)),
    // deno-lint-ignore no-explicit-any
    debug: spy((..._args: any[]) => shouldLog && console.debug(..._args)),
    _setShouldLog: (value: boolean) => shouldLog = value,
  };
}

function each(table: Global.EachTable) {
  const _table = table.map((item) => Array.isArray(item) ? item : [item]);

  return function (
    name: string,
    fn: Global.EachTestFn<Global.BlockFn>,
    timeout?: number,
  ) {
    if (timeout) throw new Error("timeout not implemented yet");

    for (const row of _table) {
      const _name = sprintf(name, ...row);
      wrappedIt(_name, (...args) => fn(...[...row, ...args]));
    }
  };
}

/**
 * Wraps test functions to allow an optional callback that will be called after the test.
 * If the test passed, it will be called without any arguments.
 * If the test failed, it will be passed the `error` object as the first paramater.
 * @param suite The name of the test suite.
 * @param fn The test function.
 * @returns A wrapped test function.
 *
 * For yf2 specifically, we use this together with some fetch-mock-cache options to allow
 * us, when FETCH_DEVEL=recache, to only rewrite the cache file for failing tests.
 */
function wrappedIt(
  suite: string,
  fn: (
    t: Deno.TestContext,
    onFinish: (cb: (error?: unknown) => void | Promise<void>) => void,
  ) => void | Promise<void>,
) {
  const finishCallbacks = [] as Array<(error?: unknown) => void>;

  const onFinish = (cb: (error?: unknown) => void) => {
    finishCallbacks.push(cb);
  };

  const finish = (error?: unknown) => {
    for (const cb of finishCallbacks) {
      cb(error);
    }
  };

  const wrappedFn = (t: Deno.TestContext) => {
    let result: ReturnType<typeof fn>;
    try {
      result = fn(t, onFinish);
    } catch (error) {
      finish(error);
      throw error;
    }

    if (result === undefined) {
      finish();
      return undefined;
    }

    if (result instanceof Promise) {
      return result.then(finish).catch((error) => {
        finish(error);
        throw error;
      });
    }

    throw new Error(
      `Test "${name}" failed with unexpected result: ${result}`,
    );
  };

  _it(suite, wrappedFn);
}

const it = wrappedIt as typeof wrappedIt & { each: typeof each };
Object.assign(it, { each });

interface ExtendedExpected<IsAsync = false> extends Expected<IsAsync> {
  toBeType: (type: ReturnType<typeof getType>) => unknown;
  not: IsAsync extends true ? Async<ExtendedExpected<true>>
    : ExtendedExpected<false>;
  resolves: Async<ExtendedExpected<true>>;
  rejects: Async<ExtendedExpected<true>>;
}

_expect.extend({
  toBeType(
    context,
    expected: ReturnType<typeof getType>,
  ) {
    const type = getType(context.value);
    const pass = type === expected;
    const toBe = context.isNot ? "to NOT be" : "to be";
    return {
      pass: context.isNot ? !pass : pass,
      message: () => `Expected "${type}" ${toBe} "${expected}"`,
    };
  },
});

const expect = _expect<ExtendedExpected>;

const setupCache = fetchCacheSetup;

/**
 * Special wrapper for `fetch()` used for tests.  We already set up
 * `fetch-cache-mock` elsewhere in this file, but this wrapper allows
 * us to call `fetchCache._once()` with additional options before
 * the fetch is executed.
 */
export function fetchDevel() {
  function fetchDevel(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1], // & { devel?: boolean | string },
  ): ReturnType<typeof fetch> {
    // @ts-expect-error: later
    const { devel, ..._init } = init || {};
    // console.log({ devel });
    if (typeof devel === "string") {
      fetchCache._once({ id: devel.replace(/\.json$/, "") });
    } else if (typeof devel === "object" && "id" in devel) {
      const isStatic = !!devel.id.match(/\.(static|fake)$/);
      if (FETCH_DEVEL_NOCACHE && !isStatic) {
        fetchCache._once({
          id: devel.id,
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
        devel.onFinish((error?: unknown) => {
          // This resolves the `writeCache` promise above.
          // Pass = don't write the cache, fail = write the cache.
          resolve(!!error);
        });

        fetchCache._once({ id: devel.id, readCache: false, writeCache });
      } else {
        fetchCache._once({ id: devel.id });
      }
    } else {
      throw new Error(
        "unexpected fetchDevel value: " + JSON.stringify(devel),
      );
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
>(
  opts: T,
): ReturnType<typeof createYahooFinance<T>> {
  return createYahooFinance({
    _allowAdditionalProps: false,
    _opts: { suppressNotices: ["yahooSurvey"] },
    ...opts,
    modules: { ...opts.modules },
    fetchDevel,
  });
}

export { testSymbols };
export { spyLogger };
export { fetchCache, fetchCacheSetup, setupCache };
export { describe, expect, it, spy };
