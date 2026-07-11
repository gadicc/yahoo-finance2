/**
 * Utility function will debounce multiple calls and combine them into a
 * single {@linkcode [modules/quote] quote} call, i.e. you'll call `quoteCombine()` many times, and
 * 50ms (default) after the last call, `quote()` will be called once so that only a single
 * HTTP request is sent to collect the data for all symbols.
 *
 * @example
 * ```ts
 * import YahooFinance from 'yahoo-finance2';
 * const yahooFinance = new YahooFinance();
 *
 * // Only a single HTTP request will be made for all of these.
 * databaseResults.forEach(async (row) => {
 *   const result = await yahooFinance.quoteCombine(row.symbol);
 *   // do something
 * });
 *
 * // Consider asking only for what you need to save on bandwidth and latency
 * const fields = [ "regularMarketPrice", "regularMarketTime" ];
 * const result = await yahooFinance.quoteCombine("TSLA", { fields });
 * ```
 *
 * ### Notes:
 * - Each `quoteCombine()` call receives the result for only the symbol it asked for.
 *
 * - Query options (i.e. `fields`, above) and the shape of the return result are identical to that of quote().
 *
 * - If you call `quoteCombine()` multiple times with different {@linkcode QuoteOptions}, `quote()` will be called separately for each unique set of queryOptions and its associated set of symbols.
 *
 * - It's fine if your code calls `quoteCombine()` many times for the same symbol. The symbol will be queried only once, and returned many times.
 *
 * - You can override the defaults with `const yahooFinance = new YahooFinance({
 *     quoteCombine: QuoteCombineOptions
 *   })`, see {@linkcode QuoteCombineOptions} for more details.
 *
 * @module quoteCombine
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

import type {
  Quote,
  QuoteOptions,
  QuoteOptionsWithReturnArray,
  QuoteResponseArray,
} from "../modules/quote.ts";
import quote from "../modules/quote.ts";

import validateAndCoerceTypes from "../lib/validateAndCoerceTypes.ts";

import schema from "../modules/quote.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

// deno-lint-ignore no-explicit-any
const slugMaps = new WeakMap<object, Map<string, any>>();

/**
 * Pass as `new YahooFinance({ quoteCombine: options })` to override the defaults.
 *
 * @example
 * ```ts
 * const yahooFinance = new YahooFinance({
 *   quoteCombine: {
 *     maxSymbolsPerRequest: 50,
 *     debounceTime: 100,
 *   },
 * });
 * ```
 */
export interface QuoteCombineOptions {
  /** The maximum number of symbols to include in a single request, default: 100 */
  maxSymbolsPerRequest?: number;
  /** The amount of time (in milliseconds) to debounce requests, default: 50 */
  debounceTime?: number;
}

/** quoteCombine defaults.  Override with `new Yahoo Finance({ quoteCombine: options })`. */
export const defaultOptions: QuoteCombineOptions = {
  maxSymbolsPerRequest: 100,
  debounceTime: 50,
};

/**
 * Debounce multiple calls into a single {@linkcode [modules/quote] quote()} network request.
 *
 * **See the {@link [other/quoteCombine] quoteCombine module} docs for examples and more.**
 * @see {@link [other/quoteCombine] quoteCombine module} docs for examples and more.
 */
export default function quoteCombine(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: QuoteOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<Quote>;

/**
 * Debounce multiple calls into a single {@linkcode [modules/quote] quote()} network request.
 *
 * **See the {@link [other/quoteCombine] quoteCombine module} docs for examples and more.**
 * @see {@link [other/quoteCombine] quoteCombine module} docs for examples and more.
 */
export default function quoteCombine(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: QuoteOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

export default function quoteCombine(
  this: ModuleThis,
  query: string,
  _queryOptionsOverrides: QuoteOptions = {},
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  const symbol = query;

  if (typeof symbol !== "string") {
    throw new Error(
      "quoteCombine expects a string query parameter, received: " +
        JSON.stringify(symbol, null, 2),
    );
  }

  if (
    _queryOptionsOverrides.return && _queryOptionsOverrides.return !== "array"
  ) {
    throw new Error("Can't specify other return types using quoteCombine()");
  }
  const queryOptionsOverrides =
    _queryOptionsOverrides as QuoteOptionsWithReturnArray;

  const validateOptions = !moduleOptions ||
    moduleOptions.validateOptions === undefined ||
    moduleOptions.validateOptions === true;

  try {
    validateAndCoerceTypes({
      source: "quoteCombine",
      type: "options",
      object: queryOptionsOverrides,
      definitions,
      schemaOrSchemaKey: "#/definitions/QuoteOptions",
      options: this._opts.validation,
      logger: this._opts.logger,
      logObj: this._logObj,
      versionCheck: this._opts.versionCheck,
    });
  } catch (error) {
    if (validateOptions) throw error;
  }

  // Make sure we only combine requests with same options
  const _slug = JSON.stringify(queryOptionsOverrides);

  let slugMap = slugMaps.get(this);
  if (!slugMap) {
    slugMap = new Map();
    slugMaps.set(this, slugMap);
  }

  let entry = slugMap.get(_slug);
  if (!entry) {
    entry = {
      timeout: null,
      queryOptionsOverrides,
      symbols: new Map(),
    };
    slugMap.set(_slug, entry);
  }

  let i = 1, slug = _slug;
  while (
    entry && entry.symbols.size >= this._opts.quoteCombine!.maxSymbolsPerRequest
  ) {
    slug = `${_slug}-${i++}`;
    entry = slugMap.get(slug);
  }
  if (!entry) {
    entry = {
      timeout: null,
      queryOptionsOverrides,
      symbols: new Map(),
    };
    slugMap.set(slug, entry);
  }

  if (entry.timeout) clearTimeout(entry.timeout);

  return new Promise((resolve, reject) => {
    let symbolPromiseCallbacks = entry.symbols.get(symbol);
    /* istanbul ignore else */
    if (!symbolPromiseCallbacks) {
      symbolPromiseCallbacks = [];
      entry.symbols.set(symbol, symbolPromiseCallbacks);
    }

    symbolPromiseCallbacks.push({ resolve, reject });

    entry.timeout = setTimeout(() => {
      slugMap.delete(slug);

      const symbols: string[] = Array.from(entry.symbols.keys());

      const thisQuote = quote.bind(this) as (
        symbols: string[],
        options?: QuoteOptionsWithReturnArray,
        moduleOptions?: ModuleOptionsWithValidateTrue,
      ) => Promise<QuoteResponseArray>;

      thisQuote(symbols, queryOptionsOverrides, {
        ...moduleOptions,
        validateResult: true,
      }).then((results) => {
        for (const result of results) {
          const promises = entry.symbols.get(result.symbol);
          if (!promises) continue; // symbol normalized/renamed by Yahoo; requester resolves undefined below (#150 loop)
          for (const promise of promises) {
            promise.resolve(result);
            promise.resolved = true;
          }
        }

        // Check for symbols we asked for and didn't get back,
        // e.g. non-existant symbols (#150)
        for (const [_symbol, promises] of entry.symbols) {
          for (const promise of promises) {
            if (!promise.resolved) {
              promise.resolve(undefined);
            }
          }
        }
      }).catch((error) => {
        for (const symbolPromiseCallbacks of entry.symbols.values()) {
          for (const promise of symbolPromiseCallbacks) promise.reject(error);
        }
      });
    }, this._opts.quoteCombine!.debounceTime);
  });
}
