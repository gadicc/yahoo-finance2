import type { YahooFinanceOptions as YahooFinanceOptionsJSON } from "./optionsJson.ts";
import { ExtendedCookieJar } from "./cookieJar.ts";
import { defaultOptions as defaultQuoteCombineOptions } from "../other/quoteCombine.ts";

export interface Logger {
  // deno-lint-ignore no-explicit-any
  info: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  warn: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  error: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  debug: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  dir: (...args: any[]) => void;
}

/**
 * Non-primitive options for {@linkcode YahooFinance}.
 *
 * See {@linkcode YahooFinanceOptionsJSON} for additional primitive options.
 *
 * @see {@link YahooFinanceOptionsJSON} for primitive options.
 */
export interface YahooFinanceOptions extends YahooFinanceOptionsJSON {
  /**
   * By default, we use an in-memory cookie store to re-use Yahoo cookies across requests.
   * This is usually fine for long running servers, but for example, for serverless / edge
   * functions, since the initial cookie retrieval takes longer, you can speed up future
   * requests by providing a custom cookie jar with a database backend.  For the CLI, we
   * likewise use a filesystem-backed cookie jar for this purpose.  See
   * {@link ../../lib/cookieJar.ts/~/ExtendedCookieJar.html ExtendedCookieJar} for more details (based on
   * {@link https://www.npmjs.com/package/tough-cookie|npm:tough-cookie}).
   */
  cookieJar?: ExtendedCookieJar;
  logger?: Logger;
  fetch?: typeof fetch;
}
export type { YahooFinanceOptionsJSON };
export { ExtendedCookieJar };

const options: YahooFinanceOptions = {
  YF_QUERY_HOST: "query2.finance.yahoo.com",
  cookieJar: new ExtendedCookieJar(),
  queue: {
    concurrency: 4, // Min: 1, Max: Infinity
    timeout: 60,
  },
  validation: {
    logErrors: true,
    logOptionsErrors: true,
    allowAdditionalProps: true,
  },
  logger: {
    // deno-lint-ignore no-explicit-any
    info: (...args: any[]) => console.log(...args),
    // deno-lint-ignore no-explicit-any
    warn: (...args: any[]) => console.warn(...args),
    // deno-lint-ignore no-explicit-any
    error: (...args: any[]) => console.error(...args),
    // deno-lint-ignore no-explicit-any
    dir: (...args: any[]) => console.dir(...args),
    // deno-lint-ignore no-explicit-any
    debug: (..._args: any[]) => {
      // XXX TODO ability to easily toggle this.
      // console.log(...args)
    },
  },
  quoteCombine: defaultQuoteCombineOptions,
};

export default options;
