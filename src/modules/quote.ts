/**
 * Quote module for retrieving real-time or near real-time quote data.
 *
 * This module provides essential symbol information including current prices,
 * market state, volume, and other key metrics for stocks, ETFs, options,
 * cryptocurrencies, and other financial instruments.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Single symbol
 * const result = await yahooFinance.quote('AAPL');
 * console.log(result.regularMarketPrice, result.currency);
 *
 * // Multiple symbols
 * const results = await yahooFinance.quote(['AAPL', 'GOOGL', 'TSLA']);
 *
 * // With options - return as object for easier access
 * const quotes = await yahooFinance.quote(['AAPL', 'GOOGL'], {
 *   return: "object"
 * });
 * console.log(quotes.AAPL.regularMarketPrice);
 *
 * // Only return specific fields
 * const minimal = await yahooFinance.quote('TSLA', {
 *   fields: ['symbol', 'regularMarketPrice', 'currency']
 * });
 * ```
 *
 * @example Options Trading
 * ```typescript
 * // Get option quote
 * const optionResult = await yahooFinance.quote("AAPL220121C00025000");
 * console.log(optionResult.strike, optionResult.expireDate);
 * ```
 *
 * @remarks
 * **Important Notes:**
 * - Some fields like `earningsTimestamp` can be inaccurate (±2 days)
 * - Delisted symbols with `quoteType: "NONE"` are filtered out
 * - Some fields may only appear during certain market hours
 * - Essential fields like `language`, `quoteType` are always returned
 *
 * @module quote
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import type { DateInMs, TwoNumberRange } from "../lib/commonTypes.ts";
import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./quote.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

/**
 * Base interface for all quote data containing common fields across all asset types.
 *
 * This interface includes essential information that appears for all financial instruments,
 * including stocks, ETFs, options, cryptocurrencies, etc.
 */
export interface QuoteBase {
  // deno-lint-ignore no-explicit-any
  [key: string]: any;

  /** Language code for the quote data, e.g., "en-US" */
  language: string; // "en-US",

  /** Region code, e.g., "US" */
  region: string; // "US",

  /** Type of financial instrument: "EQUITY", "ETF", "MUTUALFUND", "CRYPTOCURRENCY", etc. */
  quoteType: string; // "EQUITY" | "ETF" | "MUTUALFUND";

  /** Display name for the quote type, e.g., "Equity" (not always present) */
  typeDisp?: string; // "Equity", not always present.

  /** Source of the quote data, e.g., "Delayed Quote", "Nasdaq Real Time Price" */
  quoteSourceName?: string; // "Delayed Quote",

  /** Whether price alerts can be triggered for this symbol */
  triggerable: boolean; // true,

  /** Currency code, e.g., "USD" */
  currency?: string; // "USD",

  /**
   * Price alert confidence level (appears/disappears based on network load)
   * @see {@link https://github.com/gadicc/node-yahoo-finance2/issues/445}
   */
  customPriceAlertConfidence?: string; // "HIGH" | "LOW"; TODO: anything else?

  /** Current market state for this symbol */
  marketState: "REGULAR" | "CLOSED" | "PRE" | "PREPRE" | "POST" | "POSTPOST";

  /** Whether the symbol is currently tradeable */
  tradeable: boolean; // false,

  /** Whether cryptocurrency trading is available for this symbol */
  cryptoTradeable?: boolean; // false

  /** Corporate actions data (structure TBD) */
  corporateActions?: unknown[]; // [],  XXX TODO

  /** Exchange code where the symbol is traded, e.g., "NMS" */
  exchange: string; // "NMS",
  /** Short name/ticker display name, e.g., "NVIDIA Corporation" */
  shortName?: string; // "NVIDIA Corporation",

  /** Full company/instrument name, e.g., "NVIDIA Corporation" */
  longName?: string; // "NVIDIA Corporation",

  /** Yahoo Finance message board identifier */
  messageBoardId?: string; // "finmb_32307",

  /** Exchange timezone name, e.g., "America/New_York" */
  exchangeTimezoneName: string; // "America/New_York",

  /** Exchange timezone abbreviation, e.g., "EST", "EDT" */
  exchangeTimezoneShortName: string; // "EST",

  /** GMT offset in milliseconds */
  gmtOffSetMilliseconds: number; // -18000000,

  /** Market identifier, e.g., "us_market" */
  market: string; // "us_market",

  /** Whether ESG (Environmental, Social, Governance) data is available */
  esgPopulated: boolean; // false,

  /** Change from 52-week low */
  fiftyTwoWeekLowChange?: number; // 362.96002,

  /** Percentage change from 52-week low */
  fiftyTwoWeekLowChangePercent?: number; // 2.0088556,

  /** 52-week trading range with low and high values */
  fiftyTwoWeekRange?: TwoNumberRange; // "180.68 - 589.07" -> { low, high }

  /** Change from 52-week high */
  fiftyTwoWeekHighChange?: number; // -45.429993,

  /** Percentage change from 52-week high */
  fiftyTwoWeekHighChangePercent?: number; // -0.07712155,

  /** 52-week low price */
  fiftyTwoWeekLow?: number; // 180.68,

  /** 52-week high price */
  fiftyTwoWeekHigh?: number; // 589.07,

  /** 52-week percentage change */
  fiftyTwoWeekChangePercent?: number; // 22.604025

  /** Date of last dividend payment */
  dividendDate?: Date; // 1609200000,

  /**
   * Earnings announcement timestamp (may be inaccurate ±2 days)
   * @see {@link https://github.com/gadicc/node-yahoo-finance2/issues/386}
   */
  earningsTimestamp?: Date; // 1614200400,

  /**
   * Earnings period start timestamp (may be inaccurate ±2 days)
   * @see {@link https://github.com/gadicc/node-yahoo-finance2/issues/386}
   */
  earningsTimestampStart?: Date; // 1614200400,

  /**
   * Earnings period end timestamp (may be inaccurate ±2 days)
   * @see {@link https://github.com/gadicc/node-yahoo-finance2/issues/386}
   */
  earningsTimestampEnd?: Date; // 1614200400,

  /** Earnings call start timestamp */
  earningsCallTimestampStart?: Date; // 1738274400,

  /** Earnings call end timestamp */
  earningsCallTimestampEnd?: Date; // 1738274400,

  /** Whether earnings date is estimated */
  isEarningsDateEstimate?: boolean; // true

  /** Trailing 12-month annual dividend rate */
  trailingAnnualDividendRate?: number; // 0.64,

  /** Trailing price-to-earnings ratio */
  trailingPE?: number; // 88.873634,

  /** Trailing 12-month dividend yield percentage */
  trailingAnnualDividendYield?: number; // 0.0011709387,

  /** Earnings per share over trailing 12 months */
  epsTrailingTwelveMonths?: number; // 6.117,

  /** Forward-looking earnings per share estimate */
  epsForward?: number; // 11.68,

  /** Current year earnings per share estimate */
  epsCurrentYear?: number; // 9.72,

  /** Price to current year EPS ratio */
  priceEpsCurrentYear?: number; // 55.930042,

  /** Number of shares outstanding */
  sharesOutstanding?: number; // 619000000,

  /** Book value per share */
  bookValue?: number; // 24.772,

  /** 50-day moving average price */
  fiftyDayAverage?: number; // 530.8828,

  /** Change from 50-day average */
  fiftyDayAverageChange?: number; // 12.757202,

  /** Percentage change from 50-day average */
  fiftyDayAverageChangePercent?: number; // 0.024030166,

  /** 200-day moving average price */
  twoHundredDayAverage?: number; // 515.8518,

  /** Change from 200-day average */
  twoHundredDayAverageChange?: number; // 27.788208,

  /** Percentage change from 200-day average */
  twoHundredDayAverageChangePercent?: number; // 0.053868588,

  /** Market capitalization */
  marketCap?: number; // 336513171456,

  /** Forward price-to-earnings ratio */
  forwardPE?: number; // 46.54452,

  /** Price-to-book ratio */
  priceToBook?: number; // 21.945745,
  /** Data source update interval in minutes */
  sourceInterval: number; // 15,

  /** Exchange data delay in minutes */
  exchangeDataDelayedBy: number; // 0,

  /** First trade date in milliseconds since epoch (converted to Date) */
  firstTradeDateMilliseconds?: DateInMs; // 917015400000 -> Date

  /**
   * Price precision hint for display purposes
   * @remarks Was always present except occasionally missing from BTC-USD
   */
  priceHint?: number; // 2,

  /** After-hours price change percentage */
  postMarketChangePercent?: number; // 0.093813874,

  /** After-hours market timestamp */
  postMarketTime?: Date; // 1612573179 -> new Date()

  /** After-hours market price */
  postMarketPrice?: number; // 544.15,

  /** After-hours price change */
  postMarketChange?: number; // 0.51000977,

  /** Whether pre/post market data is available */
  hasPrePostMarketData?: boolean; // true,

  /** Regular market session price change */
  regularMarketChange?: number; // -2.9299927,

  /** Regular market session price change percentage */
  regularMarketChangePercent?: number; // -0.53606904,

  /** Regular market session timestamp */
  regularMarketTime?: Date; // 1612558802 -> new Date()

  /** Regular market session current/last price */
  regularMarketPrice?: number; // 543.64,

  /** Regular market session day high */
  regularMarketDayHigh?: number; // 549.19,

  /** Regular market session day range with low and high */
  regularMarketDayRange?: TwoNumberRange; // "541.867 - 549.19" -> { low, high }

  /** Regular market session day low */
  regularMarketDayLow?: number; // 541.867,

  /** Regular market session volume */
  regularMarketVolume?: number; // 4228841,

  /** Previous day's closing price */
  regularMarketPreviousClose?: number; // 546.57,

  /** Pre-market price change */
  preMarketChange?: number; // -2.9299927,

  /** Pre-market price change percentage */
  preMarketChangePercent?: number; // -0.53606904,

  /** Pre-market timestamp */
  preMarketTime?: Date; // 1612558802 -> new Date()

  /** Pre-market price */
  preMarketPrice?: number; // 543.64,

  /** Current bid price */
  bid?: number; // 543.84,

  /** Current ask price */
  ask?: number; // 544.15,

  /** Size of current bid */
  bidSize?: number; // 18,

  /** Size of current ask */
  askSize?: number; // 8,

  /** Full exchange name, e.g., "NasdaqGS" */
  fullExchangeName: string; // "NasdaqGS",

  /** Currency used for financial reporting */
  financialCurrency?: string; // "USD",

  /** Regular market session opening price */
  regularMarketOpen?: number; // 549.0,

  /** Average daily volume over 3 months */
  averageDailyVolume3Month?: number; // 7475022,

  /** Average daily volume over 10 days */
  averageDailyVolume10Day?: number; // 5546385,

  /** Display name for the symbol, e.g., "NVIDIA" */
  displayName?: string; // "NVIDIA",

  /** Symbol ticker */
  symbol: string; // "NVDA"

  /** Underlying symbol (for derivatives like options) */
  underlyingSymbol?: string; // "LD.MI" (for LDO.MI, #363)

  /** Year-to-date return (primarily for ETFs) */
  ytdReturn?: number; // 0.31

  /** Trailing 3-month returns */
  trailingThreeMonthReturns?: number; // 16.98

  /** Trailing 3-month NAV returns */
  trailingThreeMonthNavReturns?: number; // 17.08

  /** Expected IPO date for upcoming listings */
  ipoExpectedDate?: Date; // "2020-08-13",

  /** New listing date */
  newListingDate?: Date; // "2021-02-16",

  /** Date of name change */
  nameChangeDate?: Date;

  /** Previous name before name change */
  prevName?: string;

  /** Average analyst rating */
  averageAnalystRating?: string;

  /** Page view growth weekly (since 2021-11-11) */
  pageViewGrowthWeekly?: number; // Since 2021-11-11 (#326)

  /** Open interest (for options) */
  openInterest?: number; // SOHO (#248)

  /** Beta coefficient relative to market */
  beta?: number;
}

/*
 * [TODO] Fields seen in a query but not in this module yet:
 *
 *   - extendedMarketChange
 *   - extendedMarketChangePercent
 *   - extendedMarketPrice
 *   - extendedMarketTime
 *   - dayHigh (separate to regularMarketDayHigh, etc)
 *   - dayLow (separate to regularMarketDayLow, etc)
 *   - volume (separaet to regularMarketVolume, etc)
 *
 * i.e. on yahoo site, with ?fields=dayHigh,dayLow,etc.
 */

/*
 * Guaranteed fields, even we don't ask for them
 */

/**
 * Cryptocurrency quote data with specific fields for digital assets.
 */
export interface QuoteCryptoCurrency extends QuoteBase {
  quoteType: "CRYPTOCURRENCY";

  /** Current circulating supply of the cryptocurrency */
  circulatingSupply?: number;

  /** Base currency symbol, e.g., 'BTC' */
  fromCurrency?: string; // 'BTC'

  /** Quote currency symbol, e.g., 'USD=X' */
  toCurrency?: string; // 'USD=X'

  /** Last market data source, e.g., 'CoinMarketCap' */
  lastMarket?: string; // 'CoinMarketCap'

  /** URL to coin image/logo */
  coinImageUrl?: string; // 'https://s.yimg.com/uc/fin/img/reports-thumbnails/1.png'

  /** 24-hour trading volume */
  volume24Hr?: number; // 62631043072

  /** Volume across all currencies */
  volumeAllCurrencies?: number; // 62631043072

  /** Start date for this cryptocurrency */
  startDate?: Date; // new Date(1367103600 * 1000)

  /** Link to CoinMarketCap page */
  coinMarketCapLink?: string; // "https://coinmarketcap.com/currencies/bitcoin",

  /** URL to logo image */
  logoUrl?: string; // "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png"
}

/**
 * Currency quote data for forex pairs.
 */
export interface QuoteCurrency extends QuoteBase {
  quoteType: "CURRENCY";
}

/**
 * ETF (Exchange-Traded Fund) quote data with fund-specific metrics.
 */
export interface QuoteEtf extends QuoteBase {
  quoteType: "ETF";

  /** Annual dividend yield percentage */
  dividendYield?: number; // 0.54

  /** Total net assets under management */
  netAssets?: number; // 328302690000

  /** Net expense ratio percentage */
  netExpenseRatio?: number; // 0.2
}

/**
 * Stock/equity quote data with company-specific metrics.
 */
export interface QuoteEquity extends QuoteBase {
  quoteType: "EQUITY";

  /** Annual dividend rate per share */
  dividendRate?: number; // 0.96

  /** Annual dividend yield percentage */
  dividendYield?: number; // 0.51,
}

/**
 * Futures contract quote data.
 */
export interface QuoteFuture extends QuoteBase {
  quoteType: "FUTURE";

  /** Head symbol as string identifier */
  headSymbolAsString?: string; // "GC=F"

  /** Whether this is a contract symbol */
  contractSymbol: boolean; // false

  /** Underlying exchange symbol */
  underlyingExchangeSymbol: string; // "GCM22.CMX"

  /** Contract expiration date */
  expireDate: Date; // 1656374400

  /** ISO formatted expiration date */
  expireIsoDate: Date; // "2025-04-28T00:00:00Z"
}

/**
 * Market index quote data.
 */
export interface QuoteIndex extends QuoteBase {
  quoteType: "INDEX";
}

/**
 * Options contract quote data with options-specific fields.
 */
export interface QuoteOption extends QuoteBase {
  quoteType: "OPTION";

  /** Strike price of the option */
  strike: number;

  /** Open interest (number of open contracts) */
  openInterest: number;

  /** Expiration date as timestamp */
  expireDate: number;

  /** ISO formatted expiration date */
  expireIsoDate: Date; // "2025-04-28T00:00:00Z"

  /** Symbol of the underlying asset */
  underlyingSymbol: string;
}

/**
 * Mutual fund quote data.
 */
export interface QuoteMutualfund extends QuoteBase {
  quoteType: "MUTUALFUND";

  /** Whether pre/post market data is available (typically false for mutual funds) */
  hasPrePostMarketData?: boolean; // false

  /** Annual dividend rate per share */
  dividendRate?: number; // 0.96

  /** Annual dividend yield percentage */
  dividendYield?: number; // 0.51
}

/**
 * Money market fund quote data.
 */
export interface QuoteMoneyMarket extends QuoteBase {
  quoteType: "MONEYMARKET";
  typeDisp: "MoneyMarket";

  /** Total net assets under management */
  netAssets?: number; // 1
}

/**
 * Union type for all possible quote data structures.
 *
 * The actual interface returned depends on the `quoteType` field:
 * - `"EQUITY"` → QuoteEquity
 * - `"ETF"` → QuoteEtf
 * - `"CRYPTOCURRENCY"` → QuoteCryptoCurrency
 * - `"OPTION"` → QuoteOption
 * - `"MUTUALFUND"` → QuoteMutualfund
 * - `"CURRENCY"` → QuoteCurrency
 * - `"FUTURE"` → QuoteFuture
 * - `"INDEX"` → QuoteIndex
 * - `"MONEYMARKET"` → QuoteMoneyMarket
 *
 * @discriminator quoteType
 */
export type Quote =
  | QuoteCryptoCurrency
  | QuoteCurrency
  | QuoteEtf
  | QuoteEquity
  | QuoteFuture
  | QuoteIndex
  | QuoteMutualfund
  | QuoteOption
  | QuoteMoneyMarket;

/** All possible field names available in quote data */
export type QuoteField = keyof Quote;

/** Return format options for quote results */
export type ResultType = "array" | "object" | "map";

/** Quote result as an array (default return type) */
export type QuoteResponseArray = Quote[];

/** Quote result as a Map with symbol as key */
export type QuoteResponseMap = Map<string, Quote>;

/** Quote result as an object with symbol as property name */
export type QuoteResponseObject = { [key: string]: Quote };

/**
 * Configuration options for quote requests.
 */
export interface QuoteOptions {
  /**
   * Specific fields to return. If not specified, all available fields are returned.
   * Some essential fields like `language`, `quoteType`, `symbol` are always included.
   */
  fields?: QuoteField[];

  /**
   * Format for the returned data:
   * - `"array"` (default): Returns array of quotes in same order as input symbols
   * - `"object"`: Returns object with symbol names as keys
   * - `"map"`: Returns Map with symbol names as keys
   */
  return?: ResultType;
}

/** Quote options with array return type (default) */
export interface QuoteOptionsWithReturnArray extends QuoteOptions {
  return?: "array";
}

/** Quote options with Map return type */
export interface QuoteOptionsWithReturnMap extends QuoteOptions {
  return: "map";
}

/** Quote options with object return type */
export interface QuoteOptionsWithReturnObject extends QuoteOptions {
  return: "object";
}

const queryOptionsDefaults = {};

/* --- array input, typed output, honor "return" param --- */

/**
 * Get quote data for multiple symbols returning an array.
 *
 * @param query - Array of symbol strings to get quotes for
 * @param queryOptionsOverrides - Optional query configuration
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to array of Quote objects
 */
export default function quote(
  this: ModuleThis,
  query: string[],
  queryOptionsOverrides?: QuoteOptionsWithReturnArray,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<QuoteResponseArray>;

/**
 * Get quote data for multiple symbols returning a Map.
 *
 * @param query - Array of symbol strings to get quotes for
 * @param queryOptionsOverrides - Query configuration with return: "map"
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to Map with symbols as keys and Quote objects as values
 */
export default function quote(
  this: ModuleThis,
  query: string[],
  queryOptionsOverrides?: QuoteOptionsWithReturnMap,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<QuoteResponseMap>;

/**
 * Get quote data for multiple symbols returning an object.
 *
 * @param query - Array of symbol strings to get quotes for
 * @param queryOptionsOverrides - Query configuration with return: "object"
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to object with symbols as properties and Quote objects as values
 */
export default function quote(
  this: ModuleThis,
  query: string[],
  queryOptionsOverrides?: QuoteOptionsWithReturnObject,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<QuoteResponseObject>;

/* --- everything else --- */

/**
 * Get quote data for a single symbol.
 *
 * @param query - Symbol string to get quote for
 * @param queryOptionsOverrides - Optional query configuration
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to a Quote object
 */
export default function quote(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: QuoteOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<Quote>;

/**
 * Get quote data with validation disabled.
 *
 * @param query - Symbol string or array of symbols
 * @param queryOptionsOverrides - Optional query configuration
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated data
 */
export default function quote(
  this: ModuleThis,
  query: string | string[],
  queryOptionsOverrides?: QuoteOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
  // deno-lint-ignore no-explicit-any
): Promise<any>;

/**
 * Get real-time or near real-time quote data for financial instruments.
 *
 * This function retrieves essential symbol information including current prices,
 * market state, volume, and other key metrics. It supports stocks, ETFs, options,
 * cryptocurrencies, mutual funds, and other financial instruments.
 *
 * @example Single Symbol
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * const quote = await yahooFinance.quote('AAPL');
 * console.log(`${quote.symbol}: $${quote.regularMarketPrice} ${quote.currency}`);
 * ```
 *
 * @example Multiple Symbols
 * ```typescript
 * // Returns array by default
 * const quotes = await yahooFinance.quote(['AAPL', 'GOOGL', 'TSLA']);
 * quotes.forEach(q => console.log(`${q.symbol}: $${q.regularMarketPrice}`));
 *
 * // Or return as object for easier access
 * const quoteObj = await yahooFinance.quote(['AAPL', 'GOOGL'], {
 *   return: "object"
 * });
 * console.log(quoteObj.AAPL.regularMarketPrice);
 * ```
 *
 * @example Specific Fields Only
 * ```typescript
 * const minimal = await yahooFinance.quote('TSLA', {
 *   fields: ['symbol', 'regularMarketPrice', 'currency', 'marketState']
 * });
 * ```
 *
 * @example Options Contract
 * ```typescript
 * const option = await yahooFinance.quote("AAPL220121C00025000");
 * console.log(`Strike: $${option.strike}, Expires: ${option.expireIsoDate}`);
 * ```
 *
 * @param query - Symbol or array of symbols to get quotes for.
 *                Use search() to find symbols if needed.
 * @param queryOptionsOverrides - Optional configuration:
 *                                - `fields`: Only return specific fields
 *                                - `return`: Format as "array", "object", or "map"
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 *
 * @returns Promise that resolves to:
 *          - Single Quote object (for string input)
 *          - Quote array (for array input with default options)
 *          - Quote object/Map (for array input with return option)
 *
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid symbol format
 *         - Validation fails (if enabled)
 *
 * @remarks
 * **Important Notes:**
 * - Missing symbols are skipped in results (no undefined entries)
 * - Delisted symbols (`quoteType: "NONE"`) are filtered out
 * - Some fields like earnings dates may be inaccurate (±2 days)
 * - Essential fields (`language`, `quoteType`, etc.) are always returned
 * - Some fields only appear during certain market hours
 *
 * @see {@link QuoteOptions} for all available options
 * @see {@link Quote} for all possible return fields
 */
export default async function quote(
  this: ModuleThis,
  query: string | string[],
  queryOptionsOverrides?: QuoteOptions,
  moduleOptions?: ModuleOptions,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const symbols = typeof query === "string" ? query : query.join(",");
  const returnAs = queryOptionsOverrides && queryOptionsOverrides.return;

  const results: Quote[] = await this._moduleExec({
    moduleName: "quote",

    query: {
      url: "https://${YF_QUERY_HOST}/v7/finance/quote",
      needsCrumb: true,
      definitions,
      schemaKey: "#/definitions/QuoteOptions",
      defaults: queryOptionsDefaults,
      runtime: { symbols },
      overrides: queryOptionsOverrides,
      transformWith(queryOptions: QuoteOptions) {
        // Options validation ensures this is a string[]
        if (queryOptions.fields) queryOptions.fields.join(",");

        // Don't pass this on to Yahoo
        delete queryOptions.return;

        return queryOptions;
      },
    },

    result: {
      definitions,
      schemaKey: "#/definitions/QuoteResponseArray",
      // deno-lint-ignore no-explicit-any
      transformWith(rawResult: any) {
        let results = rawResult?.quoteResponse?.result;

        if (!results || !Array.isArray(results)) {
          throw new Error("Unexpected result: " + JSON.stringify(rawResult));
        }

        // Filter out quoteType==='NONE'
        // So that delisted stocks will be undefined just like symbol-not-found
        // deno-lint-ignore no-explicit-any
        results = results.filter((quote: any) => quote?.quoteType !== "NONE");

        return results;
      },
    },

    moduleOptions,
  });

  if (returnAs) {
    switch (returnAs) {
      case "array":
        return results as Quote[];
      case "object": {
        // deno-lint-ignore no-explicit-any
        const object = {} as any;
        for (const result of results) object[result.symbol] = result;
        return object; // TODO: type
      }
      case "map": {
        const map = new Map();
        for (const result of results) map.set(result.symbol, result);
        return map; // TODO: type
      }
    }
  } else {
    // By default, match the query input shape (string or string[]).
    return typeof query === "string"
      ? (results[0] as Quote)
      : (results as Quote[]);
  }
}
