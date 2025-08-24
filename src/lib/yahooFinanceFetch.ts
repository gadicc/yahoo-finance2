import Queue from "./queue.ts";

import type { YahooFinanceOptions } from "./options.ts";
import type { QueueOptions } from "./queue.ts";
import type Notices from "./notices.ts";

import errors from "./errors.ts";
import pkg from "../../deno.json" with { type: "json" };
import getCrumb from "./getCrumb.ts";
import { repository } from "../consts.ts";

const userAgent = `${pkg.name}/${pkg.version} (+${repository})`;
type Fetch = typeof fetch;

interface YahooFinanceFetchThisEnv {
  // deno-lint-ignore no-explicit-any
  [key: string]: any;
  fetch: Fetch | null;
  fetchDevel?: () => (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => ReturnType<typeof fetch>;
}

interface YahooFinanceFetchThis {
  // deno-lint-ignore no-explicit-any
  [key: string]: any;
  _env: YahooFinanceFetchThisEnv;
  _opts: YahooFinanceOptions;
  _notices: Notices;
}

export interface YahooFinanceFetchModuleOptions {
  /** Controls for http cache
   *  {
   *    id: string;           // cache key
   *    t: Deno.TestContext;  // test context
   *    onFinish: (cb: (error?: unknown) => void) => void;
   *  }
   *  See `tests/common.ts` for how these are used for conditional caching.
   */
  devel?: {
    id: string;
    // t: Deno.TestContext; // not used yet and causes issues with ts-json-schema
    t: unknown;
    onFinish: (cb: (error?: unknown) => void) => void;
  };
  /** An alternative fetch function to use just for this call */
  fetch?: Fetch;
  /** Any options to pass to fetch() just for this request. */
  fetchOptions?: RequestInit; // Parameters<Fetch>[1];
  queue?: QueueOptions;
}

const _queue = new Queue();

// deno-lint-ignore no-explicit-any
function assertQueueOptions(queue: any, opts: any) {
  opts; //?
  if (
    typeof opts.concurrency === "number" &&
    queue.concurrency !== opts.concurrency
  ) {
    queue.concurrency = opts.concurrency;
  }

  if (typeof opts.timeout === "number" && queue.timeout !== opts.timeout) {
    queue.timeout = opts.timeout;
  }
}

function substituteVariables(this: YahooFinanceFetchThis, urlBase: string) {
  return urlBase.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    if (varName === "YF_QUERY_HOST") {
      // const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
      // return hosts[Math.floor(Math.random() * hosts.length)];
      return this._opts.YF_QUERY_HOST || "query2.finance.yahoo.com";
    } else {
      // i.e. return unsubstituted original variable expression ${VAR}
      return match;
    }
  });
}

async function yahooFinanceFetch(
  this: YahooFinanceFetchThis,
  urlBase: string,
  params: Record<string, string> = {},
  moduleOpts: YahooFinanceFetchModuleOptions = {},
  func = "json",
  needsCrumb = false,
): Promise<unknown> {
  if (!(this && this._env)) {
    throw new errors.NoEnvironmentError(
      "yahooFinanceFetch called without this._env set",
    );
  }

  // TODO: adds func type to json schema which is not supported
  //const queue = moduleOpts.queue?._queue || _queue;
  const queue = _queue;
  assertQueueOptions(queue, { ...this._opts.queue, ...moduleOpts.queue });

  const { fetch: envFetch, fetchDevel } = this._env;

  /* istanbul ignore next */
  // no need to force coverage on real network request.
  const fetchFunc = moduleOpts.devel
    ? await fetchDevel!()
    : moduleOpts.fetch || envFetch || this._opts.fetch || globalThis.fetch;

  const fetchOptionsBase = {
    ...moduleOpts.fetchOptions,
    devel: moduleOpts.devel,
    headers: {
      "User-Agent": userAgent,
      ...moduleOpts.fetchOptions?.headers,
    },
  };

  if (needsCrumb) {
    if (!this._opts.cookieJar) throw new Error("No cookieJar set");

    if (!this._opts.logger) throw new Error("Logger was unset.");

    const crumb = await getCrumb(
      this._opts.cookieJar,
      fetchFunc,
      fetchOptionsBase,
      this._opts.logger,
      this._notices,
    );
    if (crumb) params.crumb = crumb;
  }

  const urlSearchParams = new URLSearchParams(params);
  const url = substituteVariables.call(this, urlBase) + "?" +
    urlSearchParams.toString();
  // console.log(url);

  // console.log(cookieJar.serializeSync());

  if (!this._opts.cookieJar) throw new Error("No cookieJar set");

  const fetchOptions = {
    ...fetchOptionsBase,
    headers: {
      ...fetchOptionsBase.headers,
      cookie: await this._opts.cookieJar.getCookieString(url, {
        allPaths: true,
      }),
    },
  };

  // console.log("fetch", url, fetchOptions);

  // used in moduleExec.ts
  if (func === "csv") func = "text";

  // deno-lint-ignore no-explicit-any
  const response = (await queue.add(() => fetchFunc(url, fetchOptions))) as any;

  const setCookieHeaders = response.headers.getSetCookie();
  if (setCookieHeaders) {
    if (!this._opts.cookieJar) throw new Error("No cookieJar set");
    this._opts.cookieJar.setFromSetCookieHeaders(setCookieHeaders, url);
  }

  const responseText = await response.text();

  let result = null;
  try {
    result = JSON.parse(responseText);
  } catch (error) {
    if (response.ok) {
      if (error instanceof Error) {
        throw new Error(
          `Response.ok where we expect JSON, but the response was not parsable.  ` +
            `Response: "${responseText}".  Error: "${error.message}"`,
        );
      }
    }
  }

  /*
    {
      finance: {  // or quoteSummary, or any other single key
        result: null,
        error: {
          code: 'Bad Request',
          description: 'Missing required query parameter=q'
        }
      }
    }
   */
  if (result && func === "json") {
    const keys = Object.keys(result);
    if (keys.length === 1) {
      const errorObj = result[keys[0]].error;
      if (errorObj) {
        const errorName = errorObj.code.replace(/ /g, "") + "Error";
        const ErrorClass = errors[errorName] || Error;
        throw new ErrorClass(errorObj.description);
      }
    }
  }

  // We do this last as it generally contains less information (e.g. no desc).
  if (!response.ok) {
    console.error(url);
    const error = new errors.HTTPError(responseText || response.statusText);
    error.code = response.status;
    throw error;
  }

  return result;
}

export { substituteVariables };
export default yahooFinanceFetch;
