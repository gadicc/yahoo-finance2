/**
 * Daily Losers module for retrieving stocks with the biggest price decreases.
 * 
 * This module provides information about stocks that had the largest percentage
 * price declines during the current or most recent trading day.
 * 
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 * 
 * // Get top daily losers
 * const losers = await yahooFinance.dailyLosers();
 * console.log(losers.quotes[0]); // Top loser
 * 
 * // Get more losers
 * const moreLosers = await yahooFinance.dailyLosers({ count: 20 });
 * ```
 * 
 * @example Regional Markets
 * ```typescript
 * // UK market losers
 * const ukLosers = await yahooFinance.dailyLosers({
 *   region: 'GB',
 *   lang: 'en-GB'
 * });
 * 
 * // Compare with gainers
 * const gainers = await yahooFinance.dailyGainers({ region: 'GB' });
 * const losers = await yahooFinance.dailyLosers({ region: 'GB' });
 * ```
 * 
 * @example Market Analysis
 * ```typescript
 * const losers = await yahooFinance.dailyLosers({ count: 10 });
 * 
 * console.log(`Found ${losers.quotes.length} losers`);
 * losers.quotes.forEach((stock, index) => {
 *   const change = stock.regularMarketChangePercent?.toFixed(2);
 *   console.log(`${index + 1}. ${stock.symbol}: ${change}%`);
 * });
 * 
 * // Get full quotes for detailed analysis
 * const symbols = losers.quotes.map(q => q.symbol);
 * const fullQuotes = await yahooFinance.quote(symbols);
 * ```
 * 
 * @remarks
 * **Market Sentiment**: Daily losers can provide insight into market sentiment,
 * sector rotation, and potential oversold opportunities.
 * 
 * **Filtering**: Results exclude penny stocks and very low-volume stocks to
 * focus on meaningful declines in liquid securities.
 * 
 * @module dailyLosers
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

import schema from "./dailyGainers.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

import type {
  DailyGainersOptions,
  DailyGainersResult,
} from "./dailyGainers.ts";

const queryOptionsDefaults = {
  lang: "en-US",
  region: "US",
  scrIds: "day_losers",
  count: 5,
};

/**
 * Get daily losers with validation enabled.
 * 
 * @param queryOptionsOverrides - Optional configuration for language, region, and count
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to validated DailyGainersResult (same structure as gainers)
 */
export default function dailyLosers(
  this: ModuleThis,
  queryOptionsOverrides?: DailyGainersOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<DailyGainersResult>;

/**
 * Get daily losers with validation disabled.
 * 
 * @param queryOptionsOverrides - Optional configuration for language, region, and count
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function dailyLosers(
  this: ModuleThis,
  queryOptionsOverrides?: DailyGainersOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
  // deno-lint-ignore no-explicit-any
): Promise<any>;

/**
 * Get stocks with the biggest price decreases during the trading day.
 * 
 * This function retrieves a list of stocks that have shown the largest percentage
 * price declines during the current or most recent trading session.
 * 
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 * 
 * // Get top 5 daily losers (default)
 * const losers = await yahooFinance.dailyLosers();
 * console.log(losers.quotes[0]); // Biggest loser of the day
 * 
 * // Get more losers
 * const moreLosers = await yahooFinance.dailyLosers({ count: 20 });
 * ```
 * 
 * @example Market Analysis
 * ```typescript
 * // Compare gainers vs losers
 * const [gainers, losers] = await Promise.all([
 *   yahooFinance.dailyGainers({ count: 5 }),
 *   yahooFinance.dailyLosers({ count: 5 })
 * ]);
 * 
 * console.log('Top Gainers:');
 * gainers.quotes.forEach(stock => {
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *   console.log(`${stock.symbol}: +${change}%`);
 * });
 * 
 * console.log('Top Losers:');
 * losers.quotes.forEach(stock => {
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *   console.log(`${stock.symbol}: ${change}%`);
 * });
 * ```
 * 
 * @example Regional Markets
 * ```typescript
 * // UK market losers
 * const ukLosers = await yahooFinance.dailyLosers({
 *   region: 'GB',
 *   lang: 'en-GB'
 * });
 * 
 * // Asian market losers
 * const jpLosers = await yahooFinance.dailyLosers({
 *   region: 'JP',
 *   lang: 'ja-JP'
 * });
 * ```
 * 
 * @example Screening for Opportunities
 * ```typescript
 * const losers = await yahooFinance.dailyLosers({ count: 50 });
 * 
 * // Filter for large-cap stocks that might be oversold
 * const oversoldLargeCaps = losers.quotes.filter(stock => 
 *   stock.regularMarketPrice > 50 && 
 *   stock.regularMarketVolume > 1000000
 * );
 * 
 * // Get detailed data for further analysis
 * const symbols = oversoldLargeCaps.map(q => q.symbol);
 * const detailed = await yahooFinance.quoteSummary(symbols[0], {
 *   modules: ['defaultKeyStatistics', 'summaryDetail']
 * });
 * ```
 * 
 * @param queryOptionsOverrides - Optional configuration:
 *                                - `count`: Number of losers to return (default: 5)
 *                                - `region`: Market region (default: "US")
 *                                - `lang`: Language for results (default: "en-US")
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 * 
 * @returns Promise that resolves to a DailyGainersResult containing:
 *          - `quotes`: Array of stock objects with price and decline data
 *          - `total`: Total number of losers found
 *          - `count`: Number of results returned
 *          - Metadata about the screening criteria used
 * 
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid region code
 *         - Validation fails (if enabled)
 * 
 * @remarks
 * **Market Insight**: Daily losers can indicate:
 * - Sector-specific weakness or rotation
 * - Broader market sentiment
 * - Potential oversold conditions for contrarian investors
 * - Company-specific news or events
 * 
 * **Filtering**: Results automatically exclude penny stocks and very low-volume
 * stocks to focus on meaningful declines in liquid securities.
 * 
 * **Data Structure**: Uses the same result structure as {@link dailyGainers}
 * but with negative percentage changes.
 * 
 * @see {@link DailyGainersOptions} for all available options (shared with gainers)
 * @see {@link DailyGainersResult} for complete result structure
 * @see {@link dailyGainers} for stocks with the biggest gains
 */
export default function dailyLosers(
  this: ModuleThis,
  queryOptionsOverrides?: DailyGainersOptions,
  moduleOptions?: ModuleOptions,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  return this._moduleExec({
    moduleName: "dailyLosers",
    query: {
      url: "https://${YF_QUERY_HOST}/v1/finance/screener/predefined/saved",
      definitions,
      schemaKey: "#/definitions/DailyGainersOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      needsCrumb: true,
    },
    result: {
      definitions,
      schemaKey: "#/definitions/DailyGainersResult",
      // deno-lint-ignore no-explicit-any
      transformWith(result: any) {
        if (!result.finance) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }
        return result.finance.result[0];
      },
    },
    moduleOptions,
  });
}
