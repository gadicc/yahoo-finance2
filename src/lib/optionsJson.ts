/*
 * The "JSON" part of options that can be validated against a JSON schema,
 * i.e. no functions or classes.
 */

// TODO, keep defaults there too?
import type { ValidationOptions } from "./validateAndCoerceTypes.ts";
import type { QueueOptions } from "./queue.ts";
import type { NOTICE_IDS } from "./notices.ts";
import type { QuoteCombineOptions } from "../other/quoteCombine.ts";

export interface YahooFinanceOptions {
  YF_QUERY_HOST?: string;
  queue?: QueueOptions;
  validation?: ValidationOptions;
  /** Optional array of notice ids to suppress, e.g. ["yahooSurvey"] */
  suppressNotices?: NOTICE_IDS[];
  // The following are added back in options.ts to avoid json-schema
  // cookieJar?: ExtendedCookieJar;
  // logger?: Logger;
  quoteCombine?: QuoteCombineOptions;
}
