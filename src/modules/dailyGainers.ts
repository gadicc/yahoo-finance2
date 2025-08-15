/**
 * Daily Gainers module for retrieving stocks with the biggest price increases.
 * 
 * This module provides information about stocks that had the largest percentage
 * price gains during the current or most recent trading day.
 * 
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 * 
 * // Get top daily gainers
 * const gainers = await yahooFinance.dailyGainers();
 * console.log(gainers.quotes[0]); // Top gainer
 * 
 * // Get more gainers
 * const moreGainers = await yahooFinance.dailyGainers({ count: 20 });
 * ```
 * 
 * @example Regional Markets
 * ```typescript
 * // UK market gainers
 * const ukGainers = await yahooFinance.dailyGainers({
 *   region: 'GB',
 *   lang: 'en-GB'
 * });
 * 
 * // German market gainers
 * const deGainers = await yahooFinance.dailyGainers({
 *   region: 'DE',
 *   lang: 'de-DE'
 * });
 * ```
 * 
 * @example Working with Results
 * ```typescript
 * const gainers = await yahooFinance.dailyGainers({ count: 10 });
 * 
 * console.log(`Found ${gainers.quotes.length} gainers`);
 * gainers.quotes.forEach((stock, index) => {
 *   console.log(`${index + 1}. ${stock.symbol}: +${stock.regularMarketChangePercent?.toFixed(2)}%`);
 * });
 * 
 * // Get full quotes for the gainers
 * const symbols = gainers.quotes.map(q => q.symbol);
 * const fullQuotes = await yahooFinance.quote(symbols);
 * ```
 * 
 * @remarks
 * **Market Hours**: Results reflect the most recent trading session. During
 * market hours, this shows intraday performance. After market close, it shows
 * the full day's performance.
 * 
 * **Filtering**: Results are pre-filtered to exclude penny stocks and very
 * low-volume stocks to focus on meaningful price movements.
 * 
 * @module dailyGainers
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./dailyGainers.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

export interface DailyGainersResult {
  id: string;
  title: string;
  description: string;
  canonicalName: string;
  criteriaMeta: DailyGainersCriteriaMeta;
  rawCriteria: string;
  start: number;
  count: number;
  total: number;
  quotes: DailyGainersQuote[];
  useRecords: boolean;
  predefinedScr: boolean;
  versionId: number;
  creationDate: number;
  lastUpdated: number;
  isPremium: boolean;
  iconUrl: string;
}

export interface DailyGainersCriteriaMeta {
  size: number;
  offset: number;
  sortField: string;
  sortType: string;
  quoteType: string;
  criteria: DailyGainersCriterum[];
  topOperator: string;
}

export interface DailyGainersCriterum {
  field: string;
  subField: null;
  operators: string[];
  values: number[];
  labelsSelected: number[];
  // deno-lint-ignore no-explicit-any
  dependentValues: any[];
}

export interface DailyGainersQuote {
  language: string;
  region: string;
  quoteType: string;
  typeDisp: string;
  quoteSourceName: string;
  triggerable: boolean;
  customPriceAlertConfidence: string;
  lastCloseTevEbitLtm?: number;
  lastClosePriceToNNWCPerShare?: number;
  firstTradeDateMilliseconds: number;
  priceHint: number;
  postMarketChangePercent?: number;
  postMarketTime?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  regularMarketChange: number;
  regularMarketTime: number;
  regularMarketPrice: number;
  regularMarketDayHigh: number;
  regularMarketDayRange: string;
  currency: string;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  regularMarketPreviousClose: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  preMarketChange: number;
  preMarketTime: number;
  preMarketPrice: number;
  preMarketChangePercent: number;
  hasPrePostMarketData: boolean;
  // deno-lint-ignore no-explicit-any
  corporateActions: any;
  earningsCallTimestampStart?: number;
  earningsCallTimestampEnd?: number;
  isEarningsDateEstimate?: boolean;
  market: string;
  messageBoardId: string;
  fullExchangeName: string;
  longName: string;
  financialCurrency?: string;
  regularMarketOpen: number;
  averageDailyVolume3Month: number;
  averageDailyVolume10Day: number;
  fiftyTwoWeekLowChange: number;
  fiftyTwoWeekLowChangePercent: number;
  fiftyTwoWeekRange: string;
  fiftyTwoWeekHighChange: number;
  fiftyTwoWeekHighChangePercent: number;
  fiftyTwoWeekChangePercent: number;
  earningsTimestamp?: number;
  earningsTimestampStart?: number;
  earningsTimestampEnd?: number;
  trailingAnnualDividendRate: number;
  trailingAnnualDividendYield: number;
  marketState: string;
  epsTrailingTwelveMonths?: number;
  epsForward?: number;
  epsCurrentYear?: number;
  priceEpsCurrentYear?: number;
  sharesOutstanding: number;
  bookValue?: number;
  fiftyDayAverage: number;
  fiftyDayAverageChange: number;
  fiftyDayAverageChangePercent: number;
  twoHundredDayAverage: number;
  twoHundredDayAverageChange: number;
  twoHundredDayAverageChangePercent: number;
  marketCap: number;
  forwardPE?: number;
  priceToBook?: number;
  sourceInterval: number;
  exchangeDataDelayedBy: number;
  exchangeTimezoneName: string;
  exchangeTimezoneShortName: string;
  gmtOffSetMilliseconds: number;
  esgPopulated: boolean;
  tradeable: boolean;
  cryptoTradeable: boolean;
  exchange: string;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  shortName: string;
  averageAnalystRating?: string;
  regularMarketChangePercent: number;
  symbol: string;
  dividendDate?: number;
  displayName?: string;
  trailingPE?: number;
  prevName?: string;
  nameChangeDate?: Date;
  ipoExpectedDate?: Date;
  dividendYield?: number;
  dividendRate?: number;
}

const queryOptionsDefaults = {
  lang: "en-US",
  region: "US",
  scrIds: "day_gainers",
  count: 5,
};

/**
 * Configuration options for daily gainers requests.
 */
export interface DailyGainersOptions {
  /** Language code for results (e.g., "en-US") */
  lang?: string;
  
  /** Region code for results (e.g., "US") */
  region?: string;
  
  /** Number of gainers to return */
  count?: number;
}

/**
 * Get daily gainers with validation enabled.
 * 
 * @param queryOptionsOverrides - Optional configuration for language, region, and count
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to validated DailyGainersResult
 */
export default function dailyGainers(
  this: ModuleThis,
  queryOptionsOverrides?: DailyGainersOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<DailyGainersResult>;

/**
 * Get daily gainers with validation disabled.
 * 
 * @param queryOptionsOverrides - Optional configuration for language, region, and count
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function dailyGainers(
  this: ModuleThis,
  queryOptionsOverrides?: DailyGainersOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
  // deno-lint-ignore no-explicit-any
): Promise<any>;

/**
 * Get stocks with the biggest price increases during the trading day.
 * 
 * This function retrieves a list of stocks that have shown the largest percentage
 * price gains during the current or most recent trading session.
 * 
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 * 
 * // Get top 5 daily gainers (default)
 * const gainers = await yahooFinance.dailyGainers();
 * console.log(gainers.quotes[0]); // Top gainer of the day
 * 
 * // Get more gainers
 * const moreGainers = await yahooFinance.dailyGainers({ count: 20 });
 * ```
 * 
 * @example Regional Markets
 * ```typescript
 * // UK market gainers
 * const ukGainers = await yahooFinance.dailyGainers({
 *   region: 'GB',
 *   lang: 'en-GB'
 * });
 * 
 * // European market gainers
 * const euGainers = await yahooFinance.dailyGainers({
 *   region: 'DE',
 *   lang: 'de-DE'
 * });
 * ```
 * 
 * @example Analyzing Results
 * ```typescript
 * const gainers = await yahooFinance.dailyGainers({ count: 10 });
 * 
 * console.log(`Total gainers found: ${gainers.total}`);
 * console.log(`Showing top ${gainers.quotes.length}`);
 * 
 * gainers.quotes.forEach((stock, index) => {
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *   const price = stock.regularMarketPrice.toFixed(2);
 *   console.log(`${index + 1}. ${stock.symbol}: $${price} (+${change}%)`);
 * });
 * 
 * // Get full quote data for detailed analysis
 * const symbols = gainers.quotes.map(q => q.symbol);
 * const fullQuotes = await yahooFinance.quote(symbols);
 * ```
 * 
 * @param queryOptionsOverrides - Optional configuration:
 *                                - `count`: Number of gainers to return (default: 5)
 *                                - `region`: Market region (default: "US")
 *                                - `lang`: Language for results (default: "en-US")
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 * 
 * @returns Promise that resolves to a DailyGainersResult containing:
 *          - `quotes`: Array of stock objects with price and change data
 *          - `total`: Total number of gainers found
 *          - `count`: Number of results returned
 *          - Metadata about the screening criteria used
 * 
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid region code
 *         - Validation fails (if enabled)
 * 
 * @remarks
 * **Market Hours**: During trading hours, results show intraday performance.
 * After market close, results reflect the full trading day's performance.
 * 
 * **Filtering**: Results automatically exclude penny stocks and very low-volume
 * stocks to focus on meaningful price movements in liquid securities.
 * 
 * **Complement**: Use with {@link dailyLosers} to get a complete picture of
 * market movement, or with {@link quote} to get additional details for specific gainers.
 * 
 * @see {@link DailyGainersOptions} for all available options
 * @see {@link DailyGainersResult} for complete result structure
 * @see {@link dailyLosers} for stocks with the biggest declines
 */
export default function dailyGainers(
  this: ModuleThis,
  queryOptionsOverrides?: DailyGainersOptions,
  moduleOptions?: ModuleOptions,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  return this._moduleExec({
    moduleName: "dailyGainers",
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
        // console.log(result);
        if (!result.finance) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }
        return result.finance.result[0];
      },
    },
    moduleOptions,
  });
}
