import type { YahooFinanceOptions } from "./options.ts";
import { ExtendedCookieJar } from "../cookieJar.ts";
import { defaultOptions as defaultLoggerOptions } from "./logger.ts";
import { defaultOptions as defaultQuoteCombineOptions } from "../../other/quoteCombine.ts";

import pkg from "../../../deno.json" with { type: "json" };
// import { repository } from "../consts.ts";

// Big thanks to @nocodehummel who figured out a User-Agent that both
// works but still allows us to identify ourselves honestly.
const userAgent = `Mozilla/5.0 (compatible; yahoo-finance2/${pkg.version})`;
// const userAgent = `${pkg.name}/${pkg.version} (+${repository})`;

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
  fetchOptions: {
    headers: {
      "User-Agent": userAgent,
    },
  },
};

export default options;
