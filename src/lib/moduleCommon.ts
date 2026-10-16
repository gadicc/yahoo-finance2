// import type ModuleExec from "./moduleExec.js";
import type { YahooFinanceFetchModuleOptions } from "./yahooFinanceFetch.ts";
export type { YahooFinanceFetchModuleOptions };

/**
 * Common options for all "modules" ({@linkcode [modules/quote] quote()}, etc).
 * Usually the 3rd parameter in most option calls, i.e.
 *
 * @example
 * ```ts
 * const moduleOptions = { validateResults: false };
 * await yf.quote("AAPL", quoteOptions, moduleOptions);
 * ```
 *
 * @see {@linkcode YahooFinanceFetchModuleOptions} for options related to HTTP requests (e.g. custom fetch or fetch options like headers, etc).
 */
export interface ModuleOptions extends YahooFinanceFetchModuleOptions {
  /** If false, lib won't validate and will leave that to Yahoo */
  validateOptions?: boolean;
  /** If false, will pass back unvalidated / untyped result from Yahoo  */
  validateResult?: boolean;
}

export interface ModuleOptionsWithValidateFalse extends ModuleOptions {
  validateResult: false;
}

export interface ModuleOptionsWithValidateTrue extends ModuleOptions {
  validateResult?: true;
}

export interface ModuleThis {
  // biome-ignore lint/suspicious/noExplicitAny: Modules attach their own methods and options to this existing shared instance contract.
  [key: string]: any;
  // TODO: should be ModuleExec function but requiring functions breaks
  // schema generation because json-schema does not support functions.
  // biome-ignore lint/suspicious/noExplicitAny: Schema generation cannot represent a function-valued module executor in this shared contract.
  _moduleExec: any;
  // _moduleExec: typeof ModuleExec;
  // _notices: Notices;
}

/**
 * test
 */
export type ModuleError = Error;
