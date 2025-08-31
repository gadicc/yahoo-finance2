import type { YahooFinanceOptions } from "./options.ts";
import { ExtendedCookieJar } from "../cookieJar.ts";
import { defaultOptions as defaultLoggerOptions } from "./logger.ts";
import { defaultOptions as defaultQuoteCombineOptions } from "../../other/quoteCombine.ts";

const options: YahooFinanceOptions = {
  YF_QUERY_HOST: "query2.finance.yahoo.com",
  cookieJar: new ExtendedCookieJar(),
  queue: {
    concurrency: 4, // Min: 1, Max: Infinity
    // timeout: 60,
  },
  validation: {
    logErrors: true,
    logOptionsErrors: true,
    allowAdditionalProps: true,
  },
  logger: defaultLoggerOptions,
  quoteCombine: defaultQuoteCombineOptions,
  versionCheck: true,
};

export default options;
