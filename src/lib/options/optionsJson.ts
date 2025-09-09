/*
 * The "JSON" part of options that can be validated against a JSON schema,
 * i.e. no functions or classes.
 */

// TODO, keep defaults there too?
import type { ValidationOptions } from "../validateAndCoerceTypes.ts";
import type { QueueOptions } from "../queue.ts";
import type { NOTICE_IDS } from "../notices.ts";
import type { QuoteCombineOptions } from "../../other/quoteCombine.ts";

// @yf-schema

/**
 * Primitive options for {@linkcode YahooFinance} (i.e. strings, numbers, booleans)
 *
 * **See {@linkcode YahooFinanceOptions} for additional non-primitive options.**
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
}

// Helpful and needed for JSDoc as imported in lib/options entrypoint.
export type {
  NOTICE_IDS,
  QueueOptions,
  QuoteCombineOptions,
  ValidationOptions,
};
