/**
 * Chart module for retrieving historical price data with extensive customization options.
 *
 * This module provides detailed historical price, volume, and event data for financial
 * instruments, with flexible date ranges, intervals, and data formats. It's the primary
 * source for building charts and conducting technical analysis.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get last year of daily data
 * const result = await yahooFinance.chart('AAPL', {
 *   period1: '2023-01-01',
 *   period2: '2024-01-01'
 * });
 *
 * console.log(result.quotes[0]); // First day's OHLCV data
 * console.log(result.meta.currency); // "USD"
 * ```
 *
 * @example Different Time Intervals
 * ```typescript
 * // Intraday 5-minute data for last 5 days
 * const intraday = await yahooFinance.chart('TSLA', {
 *   period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
 *   interval: '5m'
 * });
 *
 * // Weekly data for 2 years
 * const weekly = await yahooFinance.chart('NVDA', {
 *   period1: '2022-01-01',
 *   period2: '2024-01-01',
 *   interval: '1wk'
 * });
 *
 * // Monthly data for maximum available period
 * const monthly = await yahooFinance.chart('MSFT', {
 *   period1: new Date('1985-01-01'),
 *   interval: '1mo'
 * });
 * ```
 *
 * @example Object Format for Charting Libraries
 * ```typescript
 * // Get data in object format (better for some charting libraries)
 * const chartData = await yahooFinance.chart('GOOGL', {
 *   period1: '2023-06-01',
 *   period2: '2023-12-01',
 *   return: 'object'
 * });
 *
 * // Access data by timestamp keys
 * const timestamps = chartData.timestamp;
 * const prices = chartData.indicators.quote[0];
 *
 * timestamps.forEach((timestamp, index) => {
 *   console.log(`${new Date(timestamp * 1000)}: $${prices.close[index]}`);
 * });
 * ```
 *
 * @example Working with Events and Dividends
 * ```typescript
 * const data = await yahooFinance.chart('AAPL', {
 *   period1: '2020-01-01',
 *   period2: '2024-01-01',
 *   events: 'div|split|earn'
 * });
 *
 * // Process dividends
 * if (data.events?.dividends) {
 *   data.events.dividends.forEach(dividend => {
 *     console.log(`Dividend: $${dividend.amount} on ${dividend.date}`);
 *   });
 * }
 *
 * // Process stock splits
 * if (data.events?.splits) {
 *   data.events.splits.forEach(split => {
 *     console.log(`Split: ${split.splitRatio} on ${split.date}`);
 *   });
 * }
 * ```
 *
 * @example Cryptocurrency and International Markets
 * ```typescript
 * // Bitcoin data
 * const btc = await yahooFinance.chart('BTC-USD', {
 *   period1: '2024-01-01',
 *   interval: '1h'
 * });
 *
 * // European stocks
 * const asml = await yahooFinance.chart('ASML.AS', {
 *   period1: '2023-01-01'
 * });
 *
 * // Japanese stocks
 * const toyota = await yahooFinance.chart('7203.T', {
 *   period1: '2023-01-01'
 * });
 * ```
 *
 * @example Error Handling and Edge Cases
 * ```typescript
 * try {
 *   const result = await yahooFinance.chart('INVALID', {
 *     period1: '2023-01-01'
 *   });
 * } catch (error) {
 *   if (error.message.includes('No data found')) {
 *     console.log('Symbol may be delisted or invalid');
 *   }
 * }
 *
 * // Handle potential empty results
 * const result = await yahooFinance.chart('AAPL', {
 *   period1: '2025-01-01' // Future date
 * });
 *
 * if (result.quotes.length === 0) {
 *   console.log('No data available for the specified period');
 * }
 * ```
 *
 * @remarks
 * **Data Formats**: The module provides two return formats:
 * - `array` (default): Easier to iterate over with Date objects
 * - `object`: Optimized for charting libraries, with timestamp keys
 *
 * **Intervals**: Intraday intervals (1m, 5m, etc.) have limited historical availability
 * (~60 days for 1-minute data). Daily and longer intervals have extensive history.
 *
 * **Market Hours**: Pre/post market data is included by default but may not be
 * available for all symbols or time periods.
 *
 * **Delisted Stocks**: When a stock is delisted, ALL historical data becomes
 * unavailable through Yahoo Finance, including periods when it was actively traded.
 *
 * @see {@link historical} for a simpler interface focused on OHLCV data
 *
 * @module chart
 */

// Co-authored by @gadicc, @PythonCreator27 and @huned.

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";
import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./chart.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

export interface ChartResultObject {
  [key: string]: unknown;
  meta: ChartMeta;
  timestamp?: Array<number>;
  events?: ChartEventsObject;
  indicators: ChartIndicatorsObject;
}

export interface ChartResultArray {
  meta: ChartMeta;
  events?: ChartEventsArray;
  quotes: Array<ChartResultArrayQuote>;
}

export interface ChartResultArrayQuote {
  [key: string]: unknown;
  date: Date;
  high: number | null;
  low: number | null;
  open: number | null;
  close: number | null;
  volume: number | null;
  adjclose?: number | null;
}

export interface ChartMeta {
  [key: string]: unknown;
  currency: string; // "USD"
  symbol: string; // "AAPL",
  exchangeName: string; // "NMS",
  instrumentType: string; // "EQUITY",
  fiftyTwoWeekHigh?: number; // 226.8
  fiftyTwoWeekLow?: number; // 223.324
  firstTradeDate: Date | null; // new Date(345479400 * 1000); null in e.g. "APS.AX"
  fullExchangeName?: string; // "NasdaqGS",
  regularMarketTime: Date; // new Date(1637355602 * 1000),
  gmtoffset: number; // -18000,
  hasPrePostMarketData?: boolean;
  timezone: string; /// "EST",
  exchangeTimezoneName: string; // "America/New_York",
  regularMarketPrice: number; // 160.55,
  chartPreviousClose?: number; // 79.75; missing in e.g. "APS.AX"
  previousClose?: number; // 1137.06
  regularMarketDayHigh?: number; // 226.8
  regularMarketDayLow?: number; // 223.324
  regularMarketVolume?: number; // 33638504
  longName?: string; // "Apple Inc.",
  shortName?: string; // "Apple Inc."
  scale?: number; // 3,
  priceHint: number; // 2,
  currentTradingPeriod: {
    [key: string]: unknown;
    pre: ChartMetaTradingPeriod;
    regular: ChartMetaTradingPeriod;
    post: ChartMetaTradingPeriod;
  };
  tradingPeriods?: ChartMetaTradingPeriods | ChartMetaTradingPeriod[][];
  dataGranularity: string; // "1d",
  range: string; // "",
  validRanges: Array<string>; // ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]
}

export interface ChartMetaTradingPeriod {
  [key: string]: unknown;
  timezone: string; // "EST",
  start: Date; // new Date(1637355600 * 1000),
  end: Date; // new Date(1637370000 * 10000),
  gmtoffset: number; // -18000
}

export interface ChartMetaTradingPeriods {
  [key: string]: unknown;
  pre?: Array<Array<ChartMetaTradingPeriod>>;
  post?: Array<Array<ChartMetaTradingPeriod>>;
  regular?: Array<Array<ChartMetaTradingPeriod>>;
}

export interface ChartEventsObject {
  [key: string]: unknown;
  dividends?: ChartEventDividends;
  splits?: ChartEventSplits;
}

export interface ChartEventsArray {
  [key: string]: unknown;
  dividends?: Array<ChartEventDividend>;
  splits?: Array<ChartEventSplit>;
}

export interface ChartEventDividends {
  [key: string]: ChartEventDividend;
}

export interface ChartEventDividend {
  [key: string]: unknown;
  amount: number;
  date: Date;
}

export interface ChartEventSplits {
  [key: string]: ChartEventSplit;
}

export interface ChartEventSplit {
  [key: string]: unknown;
  date: Date; // new Date(1598880600 * 1000)
  numerator: number; // 4
  denominator: number; // 1
  splitRatio: string; // "4:1"
}

export interface ChartIndicatorsObject {
  [key: string]: unknown;
  quote: Array<ChartIndicatorQuote>;
  adjclose?: Array<ChartIndicatorAdjclose>;
}

export interface ChartIndicatorQuote {
  [key: string]: unknown;
  high: Array<number | null>;
  low: Array<number | null>;
  open: Array<number | null>;
  close: Array<number | null>;
  volume: Array<number | null>;
}

export interface ChartIndicatorAdjclose {
  [key: string]: unknown;
  adjclose?: Array<number | null>; // Missing in e.g. "APS.AX"
}

export interface ChartOptions {
  period1: Date | string | number;
  period2?: Date | string | number;
  useYfid?: boolean; // true
  interval?:
    | "1m"
    | "2m"
    | "5m"
    | "15m"
    | "30m"
    | "60m"
    | "90m"
    | "1h"
    | "1d"
    | "5d"
    | "1wk"
    | "1mo"
    | "3mo";
  includePrePost?: boolean; // true
  events?: string; // 'history',
  lang?: string; // "en-US"
  return?: "array" | "object";
}

const queryOptionsDefaults: Omit<ChartOptions, "period1"> = {
  useYfid: true,
  interval: "1d",
  includePrePost: true,
  events: "div|split|earn",
  lang: "en-US",
  return: "array",
};

export interface ChartOptionsWithReturnArray extends ChartOptions {
  return?: "array";
}
export interface ChartOptionsWithReturnObject extends ChartOptions {
  return: "object";
}

/* --- array input, typed output, honor "return" param --- */

// TODO: make this a deprecration passthrough
export const _chart = chart;

export default function chart(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: ChartOptionsWithReturnObject,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<ChartResultObject>;

export default function chart(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: ChartOptionsWithReturnArray,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<ChartResultArray>;

export default function chart(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: ChartOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

export default async function chart(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides: ChartOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  const returnAs = queryOptionsOverrides?.return || "array";

  const result = (await this._moduleExec({
    moduleName: "chart",

    query: {
      assertSymbol: symbol,
      url: "https://${YF_QUERY_HOST}/v8/finance/chart/" + symbol,
      definitions,
      schemaKey: "#/definitions/ChartOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      transformWith(queryOptions: ChartOptions) {
        if (!queryOptions.period2) queryOptions.period2 = new Date();

        const dates = ["period1", "period2"] as const;
        for (const fieldName of dates) {
          const value = queryOptions[fieldName];
          if (value instanceof Date) {
            queryOptions[fieldName] = Math.floor(value.getTime() / 1000);
          } else if (typeof value === "string") {
            const timestamp = new Date(value as string).getTime();

            if (isNaN(timestamp)) {
              throw new Error(
                "yahooFinance.chart() option '" +
                  fieldName +
                  "' invalid date provided: '" +
                  value +
                  "'",
              );
            }

            queryOptions[fieldName] = Math.floor(timestamp / 1000);
          }
        }

        if (queryOptions.period1 === queryOptions.period2) {
          throw new Error(
            "yahooFinance.chart() options `period1` and `period2` " +
              "cannot share the same value.",
          );
        }

        // Don't pass this on to Yahoo
        delete queryOptions.return;

        return queryOptions;
      },
    },

    result: {
      definitions,
      schemaKey: "#/definitions/ChartResultObject",
      // deno-lint-ignore no-explicit-any
      transformWith(result: any) {
        if (!result.chart) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }

        const chart = result.chart.result[0];

        // If there are no quotes, chart.timestamp will be empty, but Yahoo also
        // gives us chart.indicators.quotes = [{}].  Let's clean that up and
        // deliver an empty array rather than an invalid ChartIndicatorQuote/
        if (!chart.timestamp) {
          if (chart.indicators.quote.length !== 1) {
            throw new Error(
              "No timestamp with quotes.length !== 1, please report with your query",
            );
          }
          if (Object.keys(chart.indicators.quote[0]).length !== 0) {
            // i.e. {}
            throw new Error(
              "No timestamp with unexpected quote, please report with your query" +
                JSON.stringify(chart.indicators.quote[0]),
            );
          }
          chart.indicators.quote.pop();
        }

        return chart;
      },
    },

    moduleOptions,
  })) as ChartResultObject;

  if (returnAs === "object") {
    return result;
  } else if (returnAs === "array") {
    const timestamp = result.timestamp;

    /*
    seems as though yahoo inserts extra quotes at the event times, so no need.
    if (result.events) {
      for (let event of ["dividends", "splits"]) {
        // @ts-ignore
        if (result.events[event])
          // @ts-ignore
          timestamp = timestamp.filter((ts) => !result.events[event][ts]);
      }
    }
    */

    // istanbul ignore next
    if (
      timestamp &&
      result?.indicators?.quote &&
      result.indicators.quote[0].high.length !== timestamp.length
    ) {
      console.log({
        origTimestampSize: result.timestamp && result.timestamp.length,
        filteredSize: timestamp.length,
        quoteSize: result.indicators.quote[0].high.length,
      });
      throw new Error(
        "Timestamp count mismatch, please report this with the query you used",
      );
    }

    const result2 = {
      meta: result.meta,
      quotes: timestamp ? new Array(timestamp.length) : [],
    } as ChartResultArray;

    const adjclose = result?.indicators?.adjclose?.[0].adjclose;

    if (timestamp) {
      for (let i = 0; i < timestamp.length; i++) {
        result2.quotes[i] = {
          date: new Date(timestamp[i] * 1000),
          high: result.indicators.quote[0].high[i],
          volume: result.indicators.quote[0].volume[i],
          open: result.indicators.quote[0].open[i],
          low: result.indicators.quote[0].low[i],
          close: result.indicators.quote[0].close[i],
        };
        if (adjclose) result2.quotes[i].adjclose = adjclose[i];
      }
    }

    if (result.events) {
      result2.events = {};

      for (const event of ["dividends", "splits"]) {
        if (result.events[event]) {
          result2.events[event] = Object.values(result.events[event]);
        }
      }
    }

    return result2;
  }

  // TypeScript runtime validation ensures no other values for
  // "returnAs" are possible.
}
