/**
 * Daily Losers module (DEPRECATED).
 *
 * This module has been deprecated due to reliability issues. Please use the
 * {@link screener} module instead, which provides the same functionality
 * with better reliability and more customization options.
 *
 * @deprecated Use {@link screener} module with `scrIds: "day_losers"` instead
 *
 * @example Migration from dailyLosers to screener
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // ❌ Old way (deprecated)
 * // const losers = await yahooFinance.dailyLosers();
 *
 * // ✅ New way
 * const losers = await yahooFinance.screener({
 *   scrIds: "day_losers",
 *   count: 5
 * });
 *
 * // Same result structure as before
 * console.log(losers.quotes[0]); // Top loser
 * ```
 *
 * @example Migration with regional markets
 * ```typescript
 * // ❌ Old way (deprecated)
 * // const ukLosers = await yahooFinance.dailyLosers({
 * //   region: 'GB',
 * //   lang: 'en-GB'
 * // });
 *
 * // ✅ New way
 * const ukLosers = await yahooFinance.screener({
 *   scrIds: "day_losers",
 *   region: 'GB',
 *   lang: 'en-GB',
 *   count: 10
 * });
 * ```
 *
 * @example Market analysis with both gainers and losers
 * ```typescript
 * // Get both gainers and losers for market analysis
 * const [gainers, losers] = await Promise.all([
 *   yahooFinance.screener({ scrIds: "day_gainers", count: 10 }),
 *   yahooFinance.screener({ scrIds: "day_losers", count: 10 })
 * ]);
 *
 * // Analyze market sentiment
 * const avgGain = gainers.quotes.reduce((sum, q) => sum + q.regularMarketChangePercent, 0) / gainers.quotes.length;
 * const avgLoss = losers.quotes.reduce((sum, q) => sum + q.regularMarketChangePercent, 0) / losers.quotes.length;
 * console.log(`Market sentiment: +${avgGain.toFixed(2)}% vs ${avgLoss.toFixed(2)}%`);
 * ```
 *
 * @throws Always throws an error explaining the deprecation and migration path
 *
 * @see {@link screener} for stock screening functionality
 * @see {@link https://github.com/gadicc/node-yahoo-finance2/blob/devel/docs/modules/screener.md} for screener documentation
 *
 * @module dailyLosers
 */

import type { ModuleThis } from "../lib/moduleCommon.ts";

/**
 * Daily losers function (DEPRECATED).
 *
 * This function always throws an error as it has been deprecated in favor
 * of the screener module which provides the same functionality with better
 * reliability and more options.
 *
 * @throws Error explaining deprecation and suggesting to use screener() instead
 * @deprecated Use {@link screener} module with `scrIds: "day_losers"` instead
 */
export default function dailyLosers(): never {
  throw new Error(
    "dailyLosers module has been deprecated due to reliability issues. " +
      "Use screener({ scrIds: 'day_losers' }) instead. " +
      "See https://github.com/gadicc/node-yahoo-finance2/blob/devel/docs/modules/screener.md for details.",
  );
}
