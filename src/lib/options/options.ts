import { ExtendedCookieJar } from "../cookieJar.ts";
import type { YahooFinance } from "../../createYahooFinance.ts";
import { type Logger, validateOptions as validateLogger } from "./logger.ts";

import optionsSchema from "./options.schema.json" with { type: "json" };
import validateAndCoerceTypes from "../../lib/validateAndCoerceTypes.ts";
import { getTypedDefinitions } from "../../lib/validate/index.ts";

// TODO, keep defaults there too?
import type { ValidationOptions } from "../validateAndCoerceTypes.ts";
import type { QueueOptions } from "../queue.ts";
import type { NOTICE_IDS } from "../notices.ts";
import type { QuoteCombineOptions } from "../../other/quoteCombine.ts";

const definitions = getTypedDefinitions(optionsSchema);

// @yf-schema
/**
 * Options for {@linkcode YahooFinance}.
 *
 * @example
 * ```ts
 * import YahooFinance from 'yahoo-finance2';
 * const yahooFinance = new YahooFinance({
 *   suppressNotices: ["yahooSurvey"],
 *   // etc
 * });
 * ```
 */
export interface YahooFinanceOptions {
  /**
   * Where to send queries.  Default: `query2.finance.yahoo.com`.
   *
   * As per
   * [this stackoverflow post](https://stackoverflow.com/questions/44030983/yahoo-finance-url-not-working/47505102#47505102):
   *
   * - `query1.finance.yahoo.com` serves `HTTP/1.0`
   * - `query2.finance.yahoo.com` serves `HTTP/1.1`
   * - [Differences between HTTP/1.0 and HTTP/1.1](https://stackoverflow.com/questions/246859/http-1-0-vs-1-1)
   *
   * Note: this does not affect redirects to other hosts used by e.g. Yahoo's cookies and consent.
   */
  YF_QUERY_HOST?: string;
  /** Override the default queue options, e.g. concurrency and timeout. */
  queue?: QueueOptions;
  /** Override the default validation options, e.g. logErrors, logOptionsErrors, etc.  */
  validation?: ValidationOptions;
  /** Optional array of notice ids to suppress, e.g. ["yahooSurvey"] */
  suppressNotices?: NOTICE_IDS[];
  /** Override the default quote combine options, e.g. maxSymbolsPerRequest, debounceTime. */
  quoteCombine?: QuoteCombineOptions;
  /** On errors, check if we're using the latest version and notify otherwise (default: true) */
  versionCheck?: boolean;
  /**
   * By default, we use an in-memory cookie store to re-use Yahoo cookies across requests.
   * This is usually fine for long running servers, but with serverless / edge functions
   * for example - since the initial cookie retrieval takes longer - you can speed up future
   * requests by providing a custom cookie jar with a database/redis backend.  For the CLI, we
   * likewise use a filesystem-backed cookie jar for this purpose.  See
   * {@linkcode ExtendedCookieJar} for more details and examples (based on
   * {@link https://www.npmjs.com/package/tough-cookie|npm:tough-cookie}).
   */
  cookieJar?: ExtendedCookieJar;
  /**
   * By default, we use the built-in `console` for logging, but you can override it with
   * anything you like.  You can use this to control logging output or send your logs to
   * a logging service.  See
   * {@linkcode Logger} for more details and examples.
   */
  logger?: Logger;
  /**
   * By default, we'll use `globalThis.fetch` at call time for HTTP requests, however,
   * you can override it with a custom fetch implementation.  You can also override
   * `fetch` per request with {@linkcode ModuleOptions}.
   */
  fetch?: typeof fetch;
  /**
   * Any options to pass to `fetch()` for all requests.  You can also override
   * `fetchOptions` per request with {@linkcode ModuleOptions}.
   */
  fetchOptions?: RequestInit;
}

type Obj = Record<string, unknown>;
export function mergeObjects(original: Obj, objToMerge: Obj) {
  const ownKeys: (keyof typeof objToMerge)[] = Reflect.ownKeys(
    objToMerge,
  ) as string[];
  for (const key of ownKeys) {
    if (typeof objToMerge[key] === "object") {
      mergeObjects(original[key] as Obj, objToMerge[key] as Obj);
    } else {
      original[key] = objToMerge[key];
    }
  }
}

export function validateOptions(
  this: YahooFinance,
  options: YahooFinanceOptions,
  source = "_setOpts",
) {
  // Exclude complex types that won't validate properly with json-schema
  // and check later.
  const { cookieJar, logger, fetch, ...simpleOptions } = options;

  // Validation of simple JSON types
  validateAndCoerceTypes({
    object: simpleOptions,
    source,
    type: "options",
    // options: this._opts.validation!,
    options: {
      logErrors: false,
      logOptionsErrors: true,
      allowAdditionalProps: false,
    },
    schemaOrSchemaKey: "#/definitions/YahooFinanceOptions",
    definitions,
    logger: this._opts.logger!,
    logObj: this._logObj!,
    // versionCheck: this._opts.versionCheck!,
    versionCheck: false,
  });

  // Complex type checks

  if (cookieJar && !(cookieJar instanceof ExtendedCookieJar)) {
    throw new Error("cookieJar must be an instance of ExtendedCookieJar");
  }

  logger && validateLogger(logger);

  if (fetch && typeof fetch !== "function") {
    throw new Error("fetch must be a function");
  }
}

export function setOptions(this: YahooFinance, options: YahooFinanceOptions) {
  validateOptions.call(this, options);
  mergeObjects(this._opts as Obj, options as Obj);
}

// Helpful and needed for JSDoc as imported in lib/options entrypoint.
export type {
  ExtendedCookieJar,
  Logger,
  NOTICE_IDS,
  QueueOptions,
  QuoteCombineOptions,
  ValidationOptions,
};

export type {
  ModuleOptions,
  YahooFinanceFetchModuleOptions,
} from "../moduleCommon.ts";
