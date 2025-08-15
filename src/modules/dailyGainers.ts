/**
 * Daily Gainers module (DEPRECATED).
 *
 * This module has been deprecated due to reliability issues. Please use the
 * {@link screener} module instead, which provides the same functionality
 * with better reliability and more customization options.
 *
 * @deprecated Use {@link screener} module with `scrIds: "day_gainers"` instead
 *
 * @example Migration from dailyGainers to screener
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // ❌ Old way (deprecated)
 * // const gainers = await yahooFinance.dailyGainers();
 *
 * // ✅ New way
 * const gainers = await yahooFinance.screener({
 *   scrIds: "day_gainers",
 *   count: 5
 * });
 *
 * // Same result structure as before
 * console.log(gainers.quotes[0]); // Top gainer
 * ```
 *
 * @example Migration with regional markets
 * ```typescript
 * // ❌ Old way (deprecated)
 * // const ukGainers = await yahooFinance.dailyGainers({
 * //   region: 'GB',
 * //   lang: 'en-GB'
 * // });
 *
 * // ✅ New way
 * const ukGainers = await yahooFinance.screener({
 *   scrIds: "day_gainers",
 *   region: 'GB',
 *   lang: 'en-GB',
 *   count: 10
 * });
 * ```
 *
 * @example Getting more results
 * ```typescript
 * // Get top 20 gainers using screener
 * const moreGainers = await yahooFinance.screener({
 *   scrIds: "day_gainers",
 *   count: 20
 * });
 *
 * // Process results the same way
 * moreGainers.quotes.forEach((stock, index) => {
 *   console.log(`${index + 1}. ${stock.symbol}: +${stock.regularMarketChangePercent?.toFixed(2)}%`);
 * });
 * ```
 *
 * @throws Always throws an error explaining the deprecation and migration path
 *
 * @see {@link screener} for stock screening functionality
 * @see {@link https://github.com/gadicc/node-yahoo-finance2/blob/devel/docs/modules/screener.md} for screener documentation
 *
 * @module dailyGainers
 */

import type { ModuleThis } from "../lib/moduleCommon.ts";

/**
 * Daily gainers function (DEPRECATED).
 *
 * This function always throws an error as it has been deprecated in favor
 * of the screener module which provides the same functionality with better
 * reliability and more options.
 *
 * @throws Error explaining deprecation and suggesting to use screener() instead
 * @deprecated Use {@link screener} module with `scrIds: "day_gainers"` instead
 */
export default function dailyGainers(): never {
  throw new Error(
    "dailyGainers module has been deprecated due to reliability issues. " +
      "Use screener({ scrIds: 'day_gainers' }) instead. " +
      "See https://github.com/gadicc/node-yahoo-finance2/blob/devel/docs/modules/screener.md for details.",
  );
}
