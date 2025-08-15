/**
 * Trending Symbols module for retrieving symbols that are currently trending in a specific region.
 *
 * This module provides information about financial instruments that are currently
 * popular or receiving increased attention in a particular geographic region.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get trending symbols in the US
 * const usTrending = await yahooFinance.trendingSymbols('US');
 * console.log(usTrending.quotes[0]); // { symbol: 'TSLA' }
 *
 * // Get trending symbols in other regions
 * const ukTrending = await yahooFinance.trendingSymbols('GB');
 * const jpTrending = await yahooFinance.trendingSymbols('JP');
 * ```
 *
 * @example Customizing Results
 * ```typescript
 * // Get more trending symbols
 * const moreTrending = await yahooFinance.trendingSymbols('US', {
 *   count: 10
 * });
 *
 * // Different language/region combination
 * const germanTrending = await yahooFinance.trendingSymbols('DE', {
 *   lang: 'de-DE',
 *   region: 'DE'
 * });
 * ```
 *
 * @example Working with Results
 * ```typescript
 * const trending = await yahooFinance.trendingSymbols('US');
 *
 * console.log(`Found ${trending.count} trending symbols`);
 * trending.quotes.forEach((symbol, index) => {
 *   console.log(`${index + 1}. ${symbol.symbol}`);
 * });
 *
 * // Get full quotes for trending symbols
 * const symbols = trending.quotes.map(q => q.symbol);
 * const fullQuotes = await yahooFinance.quote(symbols);
 * ```
 *
 * @remarks
 * **Regional Codes**: Use standard country codes (US, GB, DE, JP, CA, etc.)
 * to get trending symbols for specific markets.
 *
 * **Update Frequency**: Trending data is updated regularly throughout
 * trading hours based on search volume and interest.
 *
 * @module trendingSymbols
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./trendingSymbols.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

/**
 * Individual trending symbol information.
 */
export interface TrendingSymbol {
  [key: string]: unknown;

  /** Stock symbol that is trending */
  symbol: string;
}

/**
 * Complete result from trending symbols request.
 */
export interface TrendingSymbolsResult {
  [key: string]: unknown;

  /** Number of trending symbols returned */
  count: number;

  /** Array of trending symbols */
  quotes: TrendingSymbol[];

  /** Job timestamp for the data */
  jobTimestamp: number;

  /** Start interval for the trending period */
  startInterval: number;
}

/**
 * Configuration options for trending symbols requests.
 */
export interface TrendingSymbolsOptions {
  /** Language code for results (e.g., "en-US") */
  lang?: string;

  /** Region code for results (e.g., "US") */
  region?: string;

  /** Number of trending symbols to return */
  count?: number;
}

const queryOptionsDefaults = {
  lang: "en-US",
  count: 5,
};

/**
 * Get trending symbols with validation enabled.
 *
 * @param query - Region code (e.g., "US", "GB", "DE")
 * @param queryOptionsOverrides - Optional configuration for language, region, and count
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to validated TrendingSymbolsResult
 */
export default function trendingSymbols(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: TrendingSymbolsOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<TrendingSymbolsResult>;

/**
 * Get trending symbols with validation disabled.
 *
 * @param query - Region code (e.g., "US", "GB", "DE")
 * @param queryOptionsOverrides - Optional configuration for language, region, and count
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function trendingSymbols(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: TrendingSymbolsOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

/**
 * Get financial symbols that are currently trending in a specific region.
 *
 * This function retrieves a list of stock symbols that are receiving increased
 * attention or search volume in a particular geographic market.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get trending symbols in the US
 * const usTrending = await yahooFinance.trendingSymbols('US');
 * console.log(usTrending.quotes); // [{ symbol: 'TSLA' }, { symbol: 'AAPL' }, ...]
 *
 * // Get trending symbols in the UK
 * const ukTrending = await yahooFinance.trendingSymbols('GB');
 * ```
 *
 * @example Custom Options
 * ```typescript
 * // Get more trending symbols
 * const moreTrending = await yahooFinance.trendingSymbols('US', {
 *   count: 10
 * });
 *
 * // Localized results
 * const germanTrending = await yahooFinance.trendingSymbols('DE', {
 *   lang: 'de-DE',
 *   region: 'DE'
 * });
 * ```
 *
 * @example Get Full Quote Data
 * ```typescript
 * const trending = await yahooFinance.trendingSymbols('US');
 *
 * // Extract just the symbols
 * const symbols = trending.quotes.map(quote => quote.symbol);
 * console.log(symbols); // ['TSLA', 'AAPL', 'MSFT', ...]
 *
 * // Get full quote data for trending symbols
 * const fullQuotes = await yahooFinance.quote(symbols);
 * fullQuotes.forEach(quote => {
 *   console.log(`${quote.symbol}: $${quote.regularMarketPrice}`);
 * });
 * ```
 *
 * @param query - Region/country code for which to get trending symbols.
 *                Common values: "US", "GB", "DE", "JP", "CA", "AU", etc.
 *                Use standard ISO country codes.
 * @param queryOptionsOverrides - Optional configuration:
 *                                - `count`: Number of symbols to return (default: 5)
 *                                - `lang`: Language code (default: "en-US")
 *                                - `region`: Region code (usually same as query)
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 *
 * @returns Promise that resolves to a TrendingSymbolsResult containing:
 *          - `quotes`: Array of trending symbol objects
 *          - `count`: Number of symbols returned
 *          - `jobTimestamp`: Timestamp when data was generated
 *          - `startInterval`: Start of trending period
 *
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid region code
 *         - Validation fails (if enabled)
 *
 * @remarks
 * **Data Freshness**: Trending data is updated regularly throughout trading
 * hours based on search volume, social media mentions, and trading activity.
 *
 * **Regional Markets**: Each region shows symbols that are trending within
 * that specific market. US trending symbols may be very different from
 * Japanese or European trending symbols.
 *
 * **Usage with Other Modules**: The trending symbols can be used as input
 * to other modules like {@link quote} or {@link quoteSummary} to get detailed
 * information about the trending instruments.
 *
 * @see {@link TrendingSymbolsOptions} for all available options
 * @see {@link TrendingSymbolsResult} for complete result structure
 */
export default function trendingSymbols(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: TrendingSymbolsOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  return this._moduleExec({
    moduleName: "trendingSymbols",
    query: {
      url: "https://${YF_QUERY_HOST}/v1/finance/trending/" + query,
      definitions,
      schemaKey: "#/definitions/TrendingSymbolsOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
    },
    result: {
      definitions,
      schemaKey: "#/definitions/TrendingSymbolsResult",
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
