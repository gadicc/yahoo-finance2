import type { YahooFinanceOptions as YahooFinanceOptionsJSON } from "../options/optionsJson.ts";
import { ExtendedCookieJar } from "../cookieJar.ts";
import type { YahooFinance } from "../../createYahooFinance.ts";
import { type Logger, validateOptions as validateLogger } from "./logger.ts";

import optionsJsonSchema from "./optionsJson.schema.json" with { type: "json" };
import validateAndCoerceTypes from "../../lib/validateAndCoerceTypes.ts";
import { getTypedDefinitions } from "../../lib/validate/index.ts";

// Since lib/options.ts is an entry point, this is both helpful and needed for jsdocs.
export type {
  NOTICE_IDS,
  QueueOptions,
  QuoteCombineOptions,
  ValidationOptions,
} from "./optionsJson.ts";
export type {
  ModuleOptions,
  YahooFinanceFetchModuleOptions,
} from "../moduleCommon.ts";

const definitions = getTypedDefinitions(optionsJsonSchema);

/**
 * Non-primitive options for {@linkcode YahooFinance} (i.e. classes, instances, funcs).
 *
 * **See {@linkcode YahooFinanceOptionsJSON} for additional primitive options.**
 *
 * @example
 * ```ts
 * import YahooFinance from 'yahoo-finance2';
 * const yahooFinance = new YahooFinance({
 *   suppressNotices: ["yahooSurvey"],
 *   // etc
 * });
 * ```
 *
 * @see {@link YahooFinanceOptionsJSON} for primitive options.
 */
export interface YahooFinanceOptions extends YahooFinanceOptionsJSON {
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
}
export type { ExtendedCookieJar, Logger, YahooFinanceOptionsJSON };

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
) {
  // Validation of simple JSON types
  validateAndCoerceTypes({
    object: options,
    source: "_setOpts",
    type: "options",
    options: this._opts.validation!,
    schemaOrSchemaKey: "#/definitions/YahooFinanceOptions",
    definitions,
    logger: this._opts.logger!,
    logObj: this._logObj!,
    versionCheck: this._opts.versionCheck!,
  });

  if (options.cookieJar && !(options.cookieJar instanceof ExtendedCookieJar)) {
    throw new Error("cookieJar must be an instance of ExtendedCookieJar");
  }

  options.logger && validateLogger(options.logger);
}

export function setOptions(this: YahooFinance, options: YahooFinanceOptions) {
  validateOptions.call(this, options);
  mergeObjects(this._opts as Obj, options as Obj);
}
