/**
 * @module moduleExec
 */
import validateAndCoerceTypes, {
  disallowAdditionalProps,
} from "./validateAndCoerceTypes.ts";
import csv2json from "./csv2json.ts";
import type { JSONSchema } from "./validate/index.ts";
import type { ModuleOptions } from "./moduleCommon.ts";

// The consuming module itself will have a stricter return type.
// deno-lint-ignore no-explicit-any
type TransformFunc = (arg: any) => any;
/*
interface TransformFunc {
  (result: { [key: string]: any }): { [key: string]: any };
}
*/

interface ModuleExecOptions {
  /**
   * Name of the module, e.g. "search", "quoteSummary", etc.  Used in error
   * reporting.
   */
  moduleName: string;

  query: {
    /**
     * If given, a runtime assertion is performed to check that the given
     * argument is a string.  If not, a helpful error is thrown.
     */
    assertSymbol?: string;
    /**
     * URL of the API to query, WITHOUT query params.
     */
    url: string;
    /**
     * Schema definitions of which `schemaKey` below should exist.
     */
    definitions: JSONSchema["definitions"];
    /**
     * Key of schema used to validate user-provider query options.
     * e.g. yf.search('AAPL', { isThisAValidOption: "maybe" })
     */
    schemaKey: string;
    /**
     * Defaults for this query, e.g. { period: '1d' } in history,
     * and other required options that aren't often changed { locale: 'en' }.
     */
    // deno-lint-ignore no-explicit-any
    defaults: any;
    /**
     * Query parameters generated inside the module, most commonly something
     * like { q: query } to take e.g. yf.search(query) and pass it how Yahoo
     * expects it.
     */
    // deno-lint-ignore no-explicit-any
    runtime?: any;
    /**
     * Query options passed by the user that will override the default and
     * runtime params.  Will be validated with schemaKey.
     */
    // deno-lint-ignore no-explicit-any
    overrides: any;
    /**
     * Called with the merged (defaults,runtime,overrides) before running
     * the query.  Useful to transform options we allow but not Yahoo, e.g.
     * allow a "2020-01-01" date but transform this to a UNIX epoch.
     */
    transformWith?: TransformFunc;
    /**
     * Default: 'json'.  Can be 'text' or 'csv' (augments fetch's "text").
     */
    fetchType?: string;
    /**
     * Default: false.  This request requires Yahoo cookies & crumb.
     */
    needsCrumb: boolean;
  };

  result: {
    /**
     * Schema definitions of which `schemaKey` below should exist.
     */
    definitions: JSONSchema["definitions"];
    /**
     * Key of schema to validate (and coerce) the retruned result from Yahoo.
     */
    schemaKey: string;
    /**
     * Mutate the Yahoo result *before* validating and coercion.  Mostly used
     * to e.g. throw if no (resault.returnField) and return result.returnField.
     */
    transformWith?: TransformFunc;
  };

  moduleOptions?: ModuleOptions;
}

// deno-lint-ignore no-explicit-any
type ThisWithModExec = { [key: string]: any; _moduleExec: typeof moduleExec };

/**
 * Executes a module with the given options.
 *
 * 1. **Query Stage**
 *     1. Validate user-supplied module params, e.g. { period: '1d' }
 *     1. Merge query params: (module defaults, user-supplied overrides, etc)
 *     1. Call `transformWith` func if provided.
 *
 * 1. Call `lib/yahooFinanceFetch.ts` with the above.
 *
 * 1. **Result Stage**
 *     1. Call `transformWith` func if provided.
 *     1. Validate the result and coerce types.
 *
 * @param this - The context of the module execution.
 * @param opts - The options for the module execution.
 * @returns A promise that resolves to the result of the module execution.
 *   It will be validated according to the requested schema but the calling
 *   module should cast to the correct type.
 */
async function moduleExec(
  this: ThisWithModExec,
  opts: ModuleExecOptions,
): Promise<unknown> {
  const queryOpts = opts.query;
  const moduleOpts = opts.moduleOptions;
  const moduleName = opts.moduleName;
  const resultOpts = opts.result;

  if (!queryOpts.definitions) {
    throw new Error(
      "no definitions in queryOpts: " + JSON.stringify(queryOpts),
    );
  }
  if (!resultOpts.definitions) {
    throw new Error(
      "no definitions in resultOpts: " + JSON.stringify(resultOpts),
    );
  }

  if (queryOpts.assertSymbol) {
    const symbol = queryOpts.assertSymbol;
    if (typeof symbol !== "string") {
      throw new Error(
        `yahooFinance.${moduleName}() expects a single string symbol as its ` +
          `query, not a(n) ${typeof symbol}: ${JSON.stringify(symbol)}`,
      );
    }
  }

  // TODO XXX, allow this to be reversed
  if (this._opts.validation?.allowAdditionalProps === false) {
    disallowAdditionalProps(resultOpts.definitions as Record<string, unknown>);
  }

  const validateOptions = !moduleOpts ||
    moduleOpts.validateOptions === undefined ||
    moduleOpts.validateOptions === true;

  // Check that query options passed by the user are valid for this module
  try {
    validateAndCoerceTypes({
      source: moduleName,
      type: "options",
      object: queryOpts.overrides ?? {},
      definitions: queryOpts.definitions,
      schemaOrSchemaKey: queryOpts.schemaKey,
      options: this._opts.validation,
      logger: this._opts.logger,
      logObj: this._logObj,
      versionCheck: this._opts.versionCheck,
    });
  } catch (error) {
    if (validateOptions) throw error;
  }

  let queryOptions = {
    ...queryOpts.defaults, // Module defaults e.g. { period: '1wk', lang: 'en' }
    ...queryOpts.runtime, // Runtime params e.g. { q: query }
    ...queryOpts.overrides, // User supplied options that override above
  };

  /*
   * Called with the merged (defaults,runtime,overrides) before running
   * the query.  Useful to transform options we allow but not Yahoo, e.g.
   * allow a "2020-01-01" date but transform this to a UNIX epoch.
   */
  if (queryOpts.transformWith) {
    queryOptions = queryOpts.transformWith(queryOptions);
  }

  // this._fetch is lib/yahooFinanceFetch
  let result = await this._fetch(
    queryOpts.url,
    queryOptions,
    moduleOpts,
    queryOpts.fetchType,
    queryOpts.needsCrumb,
  );

  if (queryOpts.fetchType === "csv") result = csv2json(result);

  /*
   * Mutate the Yahoo result *before* validating and coercion.  Mostly used
   * to e.g. throw if no (resault.returnField) and return result.returnField.
   */
  if (opts.result.transformWith) result = opts.result.transformWith(result);

  const validateResult = !moduleOpts ||
    moduleOpts.validateResult === undefined ||
    moduleOpts.validateResult === true;

  const validationOpts = {
    ...this._opts.validation,
    // Set logErrors=false if validateResult=false
    logErrors: validateResult ? this._opts.validation.logErrors : false,
  };

  /*
   * Validate the returned result (after transforming, above) and coerce types.
   *
   * The coersion works as follows: if we're expecting a "Date" type, but Yahoo
   * gives us { raw: 1231421524, fmt: "2020-01-01" }, we'll return that as
   * `new Date(1231421524 * 1000)`.
   *
   * Beyond that, ensures that user won't process unexpected data, in two
   * cases:
   *
   * a) Missing required properties or unexpected additional properties
   * b) A total new change in format that we really have no idea what to do
   *    with, e.g. a new kind of Date that we've never seen before and
   *
   * The idea is that if you receive a result, it's safe to use / store in
   * database, etc.  Otherwise you'll receive an error.
   */
  try {
    validateAndCoerceTypes({
      source: moduleName,
      type: "result",
      object: result,
      definitions: resultOpts.definitions,
      schemaOrSchemaKey: resultOpts.schemaKey,
      options: validationOpts,
      logger: this._opts.logger,
      logObj: this._logObj,
      versionCheck: this._opts.versionCheck,
    });
  } catch (error) {
    if (validateResult) throw error;
  }

  return result as unknown;
}

export default moduleExec;
