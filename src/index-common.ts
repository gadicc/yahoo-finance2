// libs
import yahooFinanceFetch from "./lib/yahooFinanceFetch.js";
import options from "./lib/options.js";
import errors from "./lib/errors.js";
import setGlobalConfig from "./lib/setGlobalConfig.js";
import moduleExec from "./lib/moduleExec.js";
import { suppressNotices } from "./lib/notices.js";

// modules
import autoc from "./modules/autoc.js";
import chart, { _chart } from "./modules/chart.js";
import historical from "./modules/historical.js";
import insights from "./modules/insights.js";
import optionsModule from "./modules/options.js";
import quote from "./modules/quote.js";
import quoteSummary from "./modules/quoteSummary.js";
import fundamentalsTimeSeries from "./modules/fundamentalsTimeSeries.js";
import recommendationsBySymbol from "./modules/recommendationsBySymbol.js";
import search from "./modules/search.js";
import trendingSymbols from "./modules/trendingSymbols.js";
import dailyGainers from "./modules/dailyGainers.js";
import screener from "./modules/screener.js";

// other
import quoteCombine from "./other/quoteCombine.js";

//
console.warn(
  "[yahoo-finance2] v2 is no longer maintained nor supported.  Please migrate to v3. " +
    "See https://github.com/gadicc/yahoo-finance2/blob/dev/docs/UPGRADING.md for details.",
);

export default {
  // internal
  _env: {},
  _fetch: yahooFinanceFetch,
  _moduleExec: moduleExec,
  _opts: options,

  // common
  errors,
  setGlobalConfig,
  suppressNotices,

  // modules,
  autoc,
  chart,
  _chart,
  historical,
  insights,
  options: optionsModule,
  quote,
  quoteSummary,
  fundamentalsTimeSeries,
  recommendationsBySymbol,
  search,
  trendingSymbols,
  dailyGainers,
  screener,

  // other
  quoteCombine,
};
