// import type ModuleExec from "./moduleExec.js";
import type { YahooFinanceFetchModuleOptions } from "./yahooFinanceFetch.ts";

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
  // deno-lint-ignore no-explicit-any
  [key: string]: any;
  // TODO: should be ModuleExec function but requiring functions breaks
  // schema generation because json-schema does not support functions.
  // deno-lint-ignore no-explicit-any
  _moduleExec: any;
  // _moduleExec: typeof ModuleExec;
  // _notices: Notices;
}

/**
 * test
 */
export type ModuleError = Error;
