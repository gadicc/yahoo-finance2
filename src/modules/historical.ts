/**
 * Historical data module for retrieving price history, dividends, and stock splits.
 *
 * This module provides historical price data, dividend payments, and stock split
 * information for financial instruments. While functional, many users prefer
 * the {@link chart} module which offers more flexibility and features.
 *
 * @example Basic Price History
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get 1 year of daily data
 * const history = await yahooFinance.historical('AAPL', {
 *   period1: '2023-01-01',
 *   period2: '2024-01-01'
 * });
 *
 * console.log(history[0]); // Most recent day
 * // { date: Date, open: 150.5, high: 155.2, low: 149.8, close: 154.1, ... }
 * ```
 *
 * @example Different Intervals
 * ```typescript
 * // Weekly data
 * const weekly = await yahooFinance.historical('AAPL', {
 *   period1: '2023-01-01',
 *   interval: '1wk'
 * });
 *
 * // Monthly data
 * const monthly = await yahooFinance.historical('AAPL', {
 *   period1: '2022-01-01',
 *   interval: '1mo'
 * });
 * ```
 *
 * @example Dividends and Splits
 * ```typescript
 * // Get dividend history
 * const dividends = await yahooFinance.historical('AAPL', {
 *   period1: '2023-01-01',
 *   events: 'dividends'
 * });
 * // Returns: [{ date: Date, dividends: 0.24 }, ...]
 *
 * // Get stock splits
 * const splits = await yahooFinance.historical('AAPL', {
 *   period1: '2020-01-01',
 *   events: 'split'
 * });
 * // Returns: [{ date: Date, stockSplits: "4:1" }, ...]
 * ```
 *
 * @remarks
 * **Limitations**:
 * - Intervals limited to daily ("1d"), weekly ("1wk"), monthly ("1mo")
 * - Events (prices, dividends, splits) require separate requests
 * - Consider using {@link chart} module for more flexibility
 *
 * **Performance**: The chart module often provides better performance and
 * more features for historical data needs.
 *
 * @module historical
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";
import type _chart from "./chart.ts";
import validateAndCoerceTypes from "../lib/validateAndCoerceTypes.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import historicalSchema from "./historical.schema.json" with { type: "json" };
import chartSchema from "./chart.schema.json" with { type: "json" };
const historicalDefinitions = getTypedDefinitions(historicalSchema);
const chartDefinitions = getTypedDefinitions(chartSchema);

/** Array of historical price data points */
export type HistoricalHistoryResult = Array<HistoricalRowHistory>;

/** Array of dividend payment records */
export type HistoricalDividendsResult = Array<HistoricalRowDividend>;

/** Array of stock split records */
export type HistoricalStockSplitsResult = Array<HistoricalRowStockSplit>;

/** Union type for all possible historical data results */
export type HistoricalResult =
  | HistoricalHistoryResult
  | HistoricalDividendsResult
  | HistoricalStockSplitsResult;

/**
 * Historical price data for a single trading day.
 */
export interface HistoricalRowHistory {
  [key: string]: unknown;
  /** Trading date */
  date: Date;
  /** Opening price */
  open: number;
  /** Highest price during the day */
  high: number;
  /** Lowest price during the day */
  low: number;
  /** Closing price */
  close: number;
  /** Adjusted closing price (accounts for splits/dividends) */
  adjClose?: number;
  /** Trading volume */
  volume: number;
}

/**
 * Dividend payment record.
 */
export interface HistoricalRowDividend {
  /** Ex-dividend date */
  date: Date;
  /** Dividend amount per share */
  dividends: number;
}

/**
 * Stock split record.
 */
export interface HistoricalRowStockSplit {
  /** Split effective date */
  date: Date;
  /** Split ratio as string (e.g., "2:1", "4:1") */
  stockSplits: string;
}

/**
 * Configuration options for historical data requests.
 */
export interface HistoricalOptions {
  /**
   * Start date for historical data.
   * Can be Date object, ISO string, or Unix timestamp.
   */
  period1: Date | string | number;

  /**
   * End date for historical data (defaults to current date).
   * Can be Date object, ISO string, or Unix timestamp.
   */
  period2?: Date | string | number;

  /**
   * Data interval/frequency.
   * @defaultValue "1d"
   */
  interval?: "1d" | "1wk" | "1mo"; // '1d',  TODO: all | types

  /**
   * Type of historical data to retrieve.
   * @defaultValue "history"
   */
  events?: "history" | "dividends" | "split"; // 'history',

  /**
   * Whether to include adjusted close prices.
   * @defaultValue true
   */
  includeAdjustedClose?: boolean; // true,
}

/** Historical options specifically for price history */
export interface HistoricalOptionsEventsHistory extends HistoricalOptions {
  events?: "history";
}

/** Historical options specifically for dividend data */
export interface HistoricalOptionsEventsDividends extends HistoricalOptions {
  events: "dividends";
}

/** Historical options specifically for stock split data */
export interface HistoricalOptionsEventsSplit extends HistoricalOptions {
  events: "split";
}

const queryOptionsDefaults: Omit<HistoricalOptions, "period1"> = {
  interval: "1d",
  events: "history",
  includeAdjustedClose: true,
};

// Count number of null values in object (1-level deep)
function nullFieldCount(object: unknown) {
  if (object == null) {
    return;
  }
  let nullCount = 0;
  for (const val of Object.values(object)) if (val === null) nullCount++;
  return nullCount;
}

/**
 * Get historical price data for a symbol.
 *
 * @param symbol - Stock symbol to get historical data for
 * @param queryOptionsOverrides - Configuration for price history
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to array of historical price records
 */
export default function historical(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: HistoricalOptionsEventsHistory,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<HistoricalHistoryResult>;

/**
 * Get dividend history for a symbol.
 *
 * @param symbol - Stock symbol to get dividend data for
 * @param queryOptionsOverrides - Configuration with events: "dividends"
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to array of dividend records
 */
export default function historical(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: HistoricalOptionsEventsDividends,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<HistoricalDividendsResult>;

/**
 * Get stock split history for a symbol.
 *
 * @param symbol - Stock symbol to get split data for
 * @param queryOptionsOverrides - Configuration with events: "split"
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to array of stock split records
 */
export default function historical(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: HistoricalOptionsEventsSplit,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<HistoricalStockSplitsResult>;

/**
 * Get historical data with validation disabled.
 *
 * @param symbol - Stock symbol to get data for
 * @param queryOptionsOverrides - Configuration options
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function historical(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: HistoricalOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
  // deno-lint-ignore no-explicit-any
): Promise<any>;

/**
 * Get historical price data, dividends, or stock splits for a financial instrument.
 *
 * This function retrieves historical data from Yahoo Finance. The type of data returned
 * depends on the `events` parameter - price history (default), dividends, or stock splits.
 *
 * @example Price History
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get 1 year of daily price data
 * const prices = await yahooFinance.historical('AAPL', {
 *   period1: '2023-01-01',
 *   period2: '2024-01-01'
 * });
 *
 * prices.forEach(day => {
 *   console.log(`${day.date.toISOString().split('T')[0]}: $${day.close}`);
 * });
 * ```
 *
 * @example Different Time Periods
 * ```typescript
 * // Last 30 days
 * const recent = await yahooFinance.historical('TSLA', {
 *   period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
 * });
 *
 * // Specific date range
 * const range = await yahooFinance.historical('GOOGL', {
 *   period1: '2023-06-01',
 *   period2: '2023-12-31',
 *   interval: '1wk'  // Weekly data
 * });
 * ```
 *
 * @example Dividends and Splits
 * ```typescript
 * // Get all dividends in 2023
 * const dividends = await yahooFinance.historical('MSFT', {
 *   period1: '2023-01-01',
 *   period2: '2024-01-01',
 *   events: 'dividends'
 * });
 *
 * // Find stock splits since 2020
 * const splits = await yahooFinance.historical('AAPL', {
 *   period1: '2020-01-01',
 *   events: 'split'
 * });
 *
 * console.log(splits); // [{ date: Date('2020-08-31'), stockSplits: "4:1" }]
 * ```
 *
 * @param symbol - Stock, ETF, or other financial instrument symbol.
 *                 Use search() to find valid symbols.
 * @param queryOptionsOverrides - Required configuration:
 *                                - `period1`: Start date (required)
 *                                - `period2`: End date (optional, defaults to now)
 *                                - `interval`: "1d", "1wk", or "1mo"
 *                                - `events`: "history", "dividends", or "split"
 *                                - `includeAdjustedClose`: Include adjusted prices
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 *
 * @returns Promise that resolves to:
 *          - Array of HistoricalRowHistory (for price data)
 *          - Array of HistoricalRowDividend (for dividend data)
 *          - Array of HistoricalRowStockSplit (for split data)
 *
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid symbol or date range
 *         - Validation fails (if enabled)
 *
 * @remarks
 * **Limitations:**
 * - Limited to daily/weekly/monthly intervals only
 * - Events (prices, dividends, splits) require separate API calls
 * - Less flexible than the chart module
 *
 * **Alternative**: Consider using {@link chart} module for:
 * - More interval options (1m, 5m, 15m, etc.)
 * - Combined events in single request
 * - Better performance for complex queries
 *
 * **Date Formats**: Accepts Date objects, ISO strings ("2023-01-01"),
 * or Unix timestamps (milliseconds since epoch).
 *
 * @see {@link HistoricalOptions} for all available options
 * @see {@link chart} for a more flexible alternative
 */
export default async function historical(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: HistoricalOptions,
  moduleOptions?: ModuleOptions,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  let schemaKey;
  this._notices.show("ripHistorical");

  if (
    !queryOptionsOverrides.events ||
    queryOptionsOverrides.events === "history"
  ) {
    schemaKey = "#/definitions/HistoricalHistoryResult";
  } else if (queryOptionsOverrides.events === "dividends") {
    schemaKey = "#/definitions/HistoricalDividendsResult";
  } else if (queryOptionsOverrides.events === "split") {
    schemaKey = "#/definitions/HistoricalStockSplitsResult";
  } else throw new Error("No such event type:" + queryOptionsOverrides.events);

  const queryOpts = { ...queryOptionsDefaults, ...queryOptionsOverrides };
  validateAndCoerceTypes({
    source: "historical",
    type: "options",
    object: queryOpts,
    definitions: historicalDefinitions,
    schemaKey: "#/definitions/HistoricalOptions",
    options: this._opts.validation,
    logger: this._opts.logger,
    logObj: this._logObj,
  });

  // Don't forget that queryOpts are already validated and safe-safe.
  const eventsMap = { history: "", dividends: "div", split: "split" };
  const chartQueryOpts = {
    period1: queryOpts.period1,
    period2: queryOpts.period2,
    interval: queryOpts.interval,
    events: eventsMap[queryOpts.events || "history"],
  };
  validateAndCoerceTypes({
    source: "historical",
    type: "options",
    object: chartQueryOpts,
    definitions: chartDefinitions,
    schemaKey: "#/definitions/ChartOptions",
    options: this._opts.validation,
    logger: this._opts.logger,
    logObj: this._logObj,
  });

  /*
    throw new Error(
      "Internal error, please report.  historical() provided invalid chart() query options.",
    );
  */

  // TODO: do we even care?
  if (queryOpts.includeAdjustedClose === false) {
    /* */
  }

  const result = await (this.chart as typeof _chart)(symbol, chartQueryOpts, {
    ...moduleOptions,
    validateResult: true,
  });

  let out;
  if (queryOpts.events === "dividends") {
    out = (result.events?.dividends ?? []).map((d) => ({
      date: d.date,
      dividends: d.amount,
    }));
  } else if (queryOpts.events === "split") {
    out = (result.events?.splits ?? []).map((s) => ({
      date: s.date,
      stockSplits: s.splitRatio,
    }));
  } else {
    out = (result.quotes ?? [])
      .filter((quote) => {
        const fieldCount = Object.keys(quote).length;
        const nullCount = nullFieldCount(quote);

        if (nullCount === 0) {
          // No nulls is a legit (regular) result
          return true;
        } else if (nullCount !== fieldCount - 1 /* skip "date" */) {
          // Unhandled case: some but not all values are null.
          // Note: no need to check for null "date", validation does it for us
          console.error(nullCount, quote);
          throw new Error(
            "Historical returned a result with SOME (but not " +
              "all) null values.  Please report this, and provide the " +
              "query that caused it.",
          );
        } else {
          // All fields (except "date") are null
          return false;
        }
      })
      .map((quote) => {
        if (!quote.adjclose) return quote;
        const { adjclose, ...rest } = quote;
        return { ...rest, adjClose: adjclose };
      });
  }

  const validateResult = !moduleOptions ||
    moduleOptions.validateResult === undefined ||
    moduleOptions.validateResult === true;

  const validationOpts = {
    ...this._opts.validation,
    // Set logErrors=false if validateResult=false
    logErrors: validateResult ? this._opts.validation.logErrors : false,
  };

  validateAndCoerceTypes({
    source: "historical",
    type: "result",
    object: out,
    definitions: historicalDefinitions,
    schemaKey,
    options: validationOpts,
    logger: this._opts.logger,
    logObj: this._logObj,
  });

  return out;

  /*
  // Original historical() retrieval code when Yahoo API still existed.
  return this._moduleExec({
    moduleName: "historical",

    query: {
      assertSymbol: symbol,
      url: "https://${YF_QUERY_HOST}/v7/finance/download/" + symbol,
      schemaKey: "#/definitions/HistoricalOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      fetchType: "csv",
      transformWith(queryOptions: HistoricalOptions) {
        if (!queryOptions.period2) queryOptions.period2 = new Date();

        const dates = ["period1", "period2"] as const;
        for (const fieldName of dates) {
          const value = queryOptions[fieldName];
          if (value instanceof Date)
            queryOptions[fieldName] = Math.floor(value.getTime() / 1000);
          else if (typeof value === "string") {
            const timestamp = new Date(value as string).getTime();

            if (isNaN(timestamp))
              throw new Error(
                "yahooFinance.historical() option '" +
                  fieldName +
                  "' invalid date provided: '" +
                  value +
                  "'",
              );

            queryOptions[fieldName] = Math.floor(timestamp / 1000);
          }
        }

        if (queryOptions.period1 === queryOptions.period2) {
          throw new Error(
            "yahooFinance.historical() options `period1` and `period2` " +
              "cannot share the same value.",
          );
        }

        return queryOptions;
      },
    },

    result: {
      schemaKey,
      transformWith(result: any) {
        if (result.length === 0) return result;

        const filteredResults = [];
        const fieldCount = Object.keys(result[0]).length;

        // Count number of null values in object (1-level deep)
        function nullFieldCount(object: Object) {
          let nullCount = 0;
          for (const val of Object.values(object))
            if (val === null) nullCount++;
          return nullCount;
        }

        for (const row of result) {
          const nullCount = nullFieldCount(row);

          if (nullCount === 0) {
            // No nulls is a legit (regular) result
            filteredResults.push(row);
          } else if (nullCount !== fieldCount - 1 /* skip "date" */
  /*) {
            // Unhandled case: some but not all values are null.
            // Note: no need to check for null "date", validation does it for us
            console.error(nullCount, row);
            throw new Error(
              "Historical returned a result with SOME (but not " +
                "all) null values.  Please report this, and provide the " +
                "query that caused it.",
            );
          } else {
            // All fields (except "date") are null: silently skip (no-op)
          }
        }

        /*
         * We may consider, for future optimization, to count rows and create
         * new array in advance, and skip consecutive blocks of null results.
         * Of doubtful utility.
         */
  /*
        return filteredResults;
      },
    },

    moduleOptions,
  });
  */
}
