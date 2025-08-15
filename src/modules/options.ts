/**
 * Options module for retrieving options chain data including calls, puts, and Greeks.
 *
 * This module provides comprehensive options data for stocks, including all available
 * expiration dates, strike prices, implied volatility, open interest, and other
 * essential options trading information.
 *
 * @example Basic Options Chain
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get complete options chain for Apple
 * const optionsData = await yahooFinance.options('AAPL');
 *
 * console.log('Available expirations:', optionsData.expirationDates);
 * console.log('Available strikes:', optionsData.strikes);
 * console.log('Underlying quote:', optionsData.quote.regularMarketPrice);
 *
 * // Access the first expiration's calls and puts
 * const firstExpiration = optionsData.options[0];
 * console.log(`Expiration: ${firstExpiration.expirationDate}`);
 * console.log(`Number of calls: ${firstExpiration.calls.length}`);
 * console.log(`Number of puts: ${firstExpiration.puts.length}`);
 * ```
 *
 * @example Specific Expiration Date
 * ```typescript
 * // Get options for a specific expiration date
 * const specificExpiration = await yahooFinance.options('TSLA', {
 *   date: new Date('2024-03-15')
 * });
 *
 * // Find in-the-money calls
 * const currentPrice = specificExpiration.quote.regularMarketPrice;
 * const itmCalls = specificExpiration.options[0].calls.filter(call =>
 *   call.strike < currentPrice && call.inTheMoney
 * );
 *
 * console.log(`Current stock price: $${currentPrice}`);
 * console.log(`In-the-money calls: ${itmCalls.length}`);
 * ```
 *
 * @example Options Analysis and Screening
 * ```typescript
 * const optionsData = await yahooFinance.options('NVDA');
 * const currentPrice = optionsData.quote.regularMarketPrice;
 *
 * // Analyze all expirations
 * optionsData.options.forEach(expiration => {
 *   console.log(`\nExpiration: ${expiration.expirationDate}`);
 *
 *   // Find at-the-money options
 *   const atmCalls = expiration.calls.filter(call =>
 *     Math.abs(call.strike - currentPrice) < 5
 *   );
 *
 *   const atmPuts = expiration.puts.filter(put =>
 *     Math.abs(put.strike - currentPrice) < 5
 *   );
 *
 *   if (atmCalls.length > 0) {
 *     const atmCall = atmCalls[0];
 *     console.log(`ATM Call: Strike $${atmCall.strike}, IV: ${(atmCall.impliedVolatility * 100).toFixed(2)}%`);
 *   }
 *
 *   if (atmPuts.length > 0) {
 *     const atmPut = atmPuts[0];
 *     console.log(`ATM Put: Strike $${atmPut.strike}, IV: ${(atmPut.impliedVolatility * 100).toFixed(2)}%`);
 *   }
 * });
 * ```
 *
 * @example High Volume and Open Interest Analysis
 * ```typescript
 * const optionsData = await yahooFinance.options('SPY');
 *
 * // Find most active options across all expirations
 * let mostActiveOptions = [];
 *
 * optionsData.options.forEach(expiration => {
 *   const allOptions = [...expiration.calls, ...expiration.puts];
 *   mostActiveOptions.push(...allOptions);
 * });
 *
 * // Sort by volume
 * mostActiveOptions.sort((a, b) => (b.volume || 0) - (a.volume || 0));
 *
 * console.log('Most Active Options:');
 * mostActiveOptions.slice(0, 10).forEach((option, index) => {
 *   const type = option.contractSymbol.includes('C') ? 'CALL' : 'PUT';
 *   console.log(`${index + 1}. ${type} Strike $${option.strike} - Volume: ${option.volume}`);
 * });
 *
 * // Find highest open interest
 * mostActiveOptions.sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0));
 * console.log('\nHighest Open Interest:');
 * mostActiveOptions.slice(0, 5).forEach(option => {
 *   console.log(`Strike $${option.strike} - OI: ${option.openInterest}`);
 * });
 * ```
 *
 * @remarks
 * **Data Refresh**: Options data is updated throughout the trading day.
 * Prices, volumes, and implied volatilities change constantly during market hours.
 *
 * **Expiration Processing**: All expiration dates are provided, but you can
 * filter to specific dates using the `date` parameter.
 *
 * **Mini Options**: Some stocks have mini options (10 shares instead of 100).
 * Check the `hasMiniOptions` flag and individual contract `contractSize`.
 *
 * **Liquidity**: Options with low volume or wide bid-ask spreads may be
 * difficult to trade. Always check volume and open interest.
 *
 * **Greeks**: Basic Greeks like implied volatility are provided. For advanced
 * Greeks (delta, gamma, theta, vega), you may need to calculate them separately.
 *
 * **Currency**: All option prices are in the underlying stock's currency.
 *
 * @see {@link quote} for current stock price and basic data
 *
 * @module options
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import type { Quote } from "./quote.ts";
import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./options.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

export interface OptionsResult {
  [key: string]: unknown;
  underlyingSymbol: string;
  expirationDates: Date[];
  strikes: number[];
  hasMiniOptions: boolean;
  quote: Quote;
  options: Option[];
}

export interface Option {
  [key: string]: unknown;
  expirationDate: Date;
  hasMiniOptions: boolean;
  calls: CallOrPut[];
  puts: CallOrPut[];
}

export interface CallOrPut {
  [key: string]: unknown;
  contractSymbol: string;
  strike: number;
  currency?: string;
  lastPrice: number;
  change: number;
  percentChange?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  contractSize: "REGULAR";
  expiration: Date;
  lastTradeDate: Date;
  impliedVolatility: number;
  inTheMoney: boolean;
}

export interface OptionsOptions {
  formatted?: boolean;
  lang?: string;
  region?: string;
  date?: Date | number | string;
}

const queryOptionsDefaults: OptionsOptions = {
  formatted: false,
  lang: "en-US",
  region: "US",
};

export default function options(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: OptionsOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<OptionsResult>;

export default function options(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: OptionsOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

export default function options(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: OptionsOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  return this._moduleExec({
    moduleName: "options",

    query: {
      assertSymbol: symbol,
      url: "https://${YF_QUERY_HOST}/v7/finance/options/" + symbol,
      needsCrumb: true,
      definitions,
      schemaKey: "#/definitions/OptionsOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      transformWith(queryOptions: OptionsOptions) {
        const date = queryOptions.date;
        if (date) {
          // yfDate will convert valid number/string to Date.
          if (date instanceof Date) {
            // now we convert back to unix epoch in seconds for query
            queryOptions.date = Math.floor(date.getTime() / 1000);
          } else {
            // yfDate didn't recognize it as a date.
            throw new Error("Unsupported date type: " + date);
          }
        }
        return queryOptions;
      },
    },

    result: {
      definitions,
      schemaKey: "#/definitions/OptionsResult",
      // deno-lint-ignore no-explicit-any
      transformWith(result: any) {
        if (!result.optionChain) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }
        return result.optionChain.result[0];
      },
    },

    moduleOptions,
  });
}
