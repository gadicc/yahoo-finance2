/**
 * @module createYahooFinance
 */
import { setOptions, type YahooFinanceOptions } from "./lib/options/options.ts";
import yahooFinanceFetch from "./lib/yahooFinanceFetch.ts";
import moduleExec from "./lib/moduleExec.ts";
import Notices from "./lib/notices.ts";
import { assertSupported } from "./lib/runtime-detect.ts";
import defaultOptions from "./lib/options/defaults.ts";

const MIN_SUPPORTED_RUNTIMES: Parameters<typeof assertSupported>[0] = {
  node: "22.0.0",
  deno: "2.0.0",
  bun: "1.0.0",
  cloudflare: {
    requireFeatures: [],
  },
};

/**
 * Instantiate a new YahooFinance client.
 *
 * See {@linkcode YahooFinanceOptions} for available options.
 *
 * @example
 * ```ts
 * const yahooFinance = new YahooFinance(); // or YahooFinance({ ...options });
 * console.log(await yahooFinance.quote("AAPL"));
 * ```
 *
 * Internal / private properties (prefixed `_`) and shown below are not part of the public API and should not be depended on.
 * You're welcome to inspect or make use of them but they might change or disappear without notice.
 *
 * @see The full list of {@link [modules] main modules} and {@link [other] other modules}.
 * @see {@linkcode [createYahooFinance].createYahooFinance createYahooFinance} for creating an API client with custom modules (advanced use-cases only).
 * @see The {@link ../../~/default.html | default} entry point that includes all modules.
 */
export class YahooFinance {
  _opts: YahooFinanceOptions;
  _fetch: typeof yahooFinanceFetch;
  _moduleExec: typeof moduleExec;
  _notices: Notices;
  // XXX TODO remove
  _env: {
    fetch: typeof fetch | null;
    fetchDevel?: () => typeof fetch;
  };
  _logObj: (obj: unknown, opts?: { depth?: number }) => void;

  _setOpts(options: YahooFinanceOptions) {
    setOptions.call(this, options);
  }

  constructor(options?: YahooFinanceOptions) {
    this._fetch = yahooFinanceFetch;
    this._moduleExec = moduleExec;
    // XXX TODO remove
    this._env = {
      fetch: null,
    };

    if ("_createOpts" in this) {
      const createOpts = this._createOpts as Record<string, unknown>;
      /// XXX TODO mergeoptions from setGlobalConfig
      this._opts = {
        ...defaultOptions,
        ...(createOpts["_opts"] as YahooFinanceOptions),
        ...options,
      };
      if ("_allowAdditionalProps" in createOpts) {
        if (!this._opts.validation) this._opts.validation = {};
        this._opts.validation.allowAdditionalProps = false;
      }
      if ("fetchDevel" in createOpts) {
        // @ts-expect-error: later
        this._env.fetchDevel = createOpts.fetchDevel;
      }
    } else {
      /// XXX TODO mergeoptions from setGlobalConfig
      this._opts = { ...defaultOptions, ...options };
    }

    // The following rely on this._opts being set
    this._notices = new Notices(this);

    // deno-coverage-ignore-start
    // @ts-ignore: relevant for ts-json-schema-generator
    this._logObj = Deno.stdout.isTerminal()
      // deno-lint-ignore no-explicit-any
      ? (obj: any, opts?: { depth?: number }) =>
        this._opts.logger!.dir(obj, { depth: opts?.depth ?? 4, colors: true })
      // deno-lint-ignore no-explicit-any
      : (obj: any) => this._opts.logger!.info(JSON.stringify(obj, null, 2));
    // deno-coverage-ignore-stop

    try {
      assertSupported(MIN_SUPPORTED_RUNTIMES);
    } catch (error) {
      const warning = ". Things might break or work unexpectedly!";
      if (error instanceof Error) {
        this._opts.logger!.warn("[yahoo-finance2] " + error.message + warning);
      } else {
        this._opts.logger!.warn(
          "[yahoo-finance2] " + JSON.stringify(error) + warning,
        );
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
type ModuleMethod = (...args: any[]) => any;

interface CreateYahooFinanceOptions {
  /** The modules (`quote`, `search`, etc) to include in this YahooFinance class */
  modules: Record<string, ModuleMethod>;
  /** The default options to use for new instances */
  _opts?: YahooFinanceOptions;
}

export type YahooFinanceWithModules<T extends CreateYahooFinanceOptions> =
  & {
    new (options?: YahooFinanceOptions):
      & YahooFinance
      & {
        [K in keyof T["modules"]]: T["modules"][K];
      };
  }
  & {
    [K in keyof T["modules"]]: T["modules"][K];
  };

/**
 * Create a new YahooFinance **class** with the given options (usually a list of modules,
 * or special options useful for testing).
 *
 * @example Basic Example
 * ```ts
 * import quote from "yahoo-finance2/modules/quote.ts";
 * import search from "yahoo-finance2/modules/search.ts";
 *
 * // Create a YahooFinance instance with the quote and search modules only.
 * const yahooFinance = createYahooFinance({
 *   modules: { quote, search }
 * });
 * ```
 *
 * By using only the modules you need, you'll have a small bundle size.  But remember,
 * `yahoo-finance2` is never bundled to the client (browser), so your savings will be
 * will be marginal (e.g. a marginally faster serverless cold start time).
 *
 * @param createOpts The {@link CreateYahooFinanceOptions} that influence the class creation.
 * @returns A {@link YahooFinance} class that you can call with `new YahooFinance()`.
 */
export default function createYahooFinance<T extends CreateYahooFinanceOptions>(
  createOpts: T,
): YahooFinanceWithModules<T> {
  const { modules, ...rest } = createOpts;
  Object.assign(YahooFinance.prototype, modules);
  Object.assign(YahooFinance.prototype, { _createOpts: rest });
  return YahooFinance as YahooFinanceWithModules<T> & {
    _createOpts: typeof rest;
  };
}
