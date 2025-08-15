/**
 * Auto-complete module (DECOMMISSIONED).
 *
 * This module has been decommissioned as Yahoo Finance discontinued their
 * auto-complete API server in November 2021.
 *
 * @deprecated Use {@link search} module instead, which provides the same
 * functionality that Yahoo Finance now uses internally.
 *
 * @example Migration from autoc to search
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // ❌ Old way (no longer works)
 * // const autoc = await yahooFinance.autoc('AAPL');
 *
 * // ✅ New way
 * const searchResults = await yahooFinance.search('AAPL');
 * const symbols = searchResults.quotes.map(q => q.symbol);
 * ```
 *
 * @throws Always throws an error explaining the decommission and migration path
 *
 * @see {@link search} for symbol search functionality
 * @see {@link https://github.com/gadicc/node-yahoo-finance2/issues/337} for more details
 *
 * @module autoc
 */

/**
 * Auto-complete function (DECOMMISSIONED).
 *
 * This function always throws an error as the Yahoo Finance auto-complete
 * API was discontinued in November 2021.
 *
 * @throws Error explaining decommission and suggesting to use search() instead
 * @deprecated Use {@link search} module instead
 */
export default function autoc(): never {
  throw new Error(
    "Yahoo decomissioned their autoc server sometime before 20 Nov 2021 " +
      "(see https://github.com/gadicc/node-yahoo-finance2/issues/337])). " +
      "Use `search` instead (just like they do).",
  );
}
