/**
 * Search module for finding financial instruments and related information.
 *
 * This module provides search functionality to find stocks, ETFs, mutual funds,
 * and other financial instruments by name, symbol, or keywords. It also returns
 * related news articles and other relevant information.
 *
 * @example Basic Search
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Search by ticker
 * const results = await yahooFinance.search('AAPL');
 * console.log(results.quotes[0]); // { symbol: 'AAPL', shortname: 'Apple Inc.', ... }
 *
 * // Search by company name
 * const google = await yahooFinance.search('Alphabet');
 * console.log(google.quotes); // [{ symbol: 'GOOGL', ... }, { symbol: 'GOOG', ... }]
 * ```
 *
 * @example Advanced Search Options
 * ```typescript
 * // Limit results and get news
 * const results = await yahooFinance.search('Tesla', {
 *   quotesCount: 5,
 *   newsCount: 10
 * });
 *
 * console.log(results.quotes.length); // Up to 5 quotes
 * console.log(results.news.length);   // Up to 10 news articles
 *
 * // Regional search
 * const ukResults = await yahooFinance.search('Vodafone', {
 *   region: 'GB',
 *   lang: 'en-GB'
 * });
 * ```
 *
 * @example Working with Results
 * ```typescript
 * const results = await yahooFinance.search('Microsoft');
 *
 * // Find exact symbol match
 * const msft = results.quotes.find(q => q.symbol === 'MSFT');
 * if (msft && 'shortname' in msft) {
 *   console.log(msft.shortname); // "Microsoft Corporation"
 * }
 *
 * // Get all equity symbols
 * const equities = results.quotes.filter(q =>
 *   'quoteType' in q && q.quoteType === 'EQUITY'
 * );
 *
 * // Browse news articles
 * results.news.forEach(article => {
 *   console.log(`${article.title} - ${article.publisher}`);
 * });
 *
 * // Check performance timing
 * console.log(`Search took ${results.totalTime}ms total`);
 * console.log(`Quotes: ${results.timeTakenForQuotes}ms`);
 * console.log(`News: ${results.timeTakenForNews}ms`);
 * ```
 *
 * ### Notes
 * 1. See {@link SearchOptions} for all available options, e.g.
 *     1. **Fuzzy Matching**: When enabled, allows approximate matching for typos
 *        and partial company names.
 *
 * 1. See {@link SearchResult} for complete result structure, comprising:
 *     1. **Yahoo Finance Symbols**: Stocks, ETFs, funds, etc. with trading data
 *     1. **Non-Yahoo Entities**: Companies / startups from Crunchbase (isYahooFinance: false)
 *     1. **News Articles**: Related financial news and analysis
 *     1. **Research reports**
 *     1. **Performance**: detailed timing information for different
 *     search components, useful for performance monitoring and optimization.
 *
 * @module search
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./search.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

/**
 * Base interface for all Yahoo Finance search quote results.
 */
export interface SearchQuoteYahoo {
  [key: string]: unknown;

  /** Trading symbol */
  symbol: string; // "BABA"

  /** Whether this result is from Yahoo Finance */
  isYahooFinance: true; // true

  /** Stock exchange code */
  exchange: string; // "NYQ"

  /** Exchange display name */
  exchDisp?: string; // "London" e.g. with BJ0CDD2

  /** Short display name */
  shortname?: string; // "Alibaba Group Holding Limited"

  /** Full company/instrument name */
  longname?: string; // "Alibaba Group Holding Limited"

  /** Search result index identifier */
  index: "quotes"; // "quotes"

  /** Search relevance score */
  score: number; // 1111958.0

  /** New listing date for recent IPOs */
  newListingDate?: Date; // "2021-02-16"

  /** Previous name before name change */
  prevName?: string;

  /** Date of name change */
  nameChangeDate?: Date;

  /** Business sector */
  sector?: string; // "Industrials"
  industry?: string; // "Building Products & Equipment"
  dispSecIndFlag?: boolean; // true
}
export interface SearchQuoteYahooEquity extends SearchQuoteYahoo {
  quoteType: "EQUITY";
  typeDisp: "Equity";
  sectorDisp?: string; // "Technology",
  industryDisp?: string; // "Consumer Electronics"
}
export interface SearchQuoteYahooOption extends SearchQuoteYahoo {
  quoteType: "OPTION";
  typeDisp: "Option";
}
export interface SearchQuoteYahooETF extends SearchQuoteYahoo {
  quoteType: "ETF";
  typeDisp: "ETF"; // "Option"
}
export interface SearchQuoteYahooFund extends SearchQuoteYahoo {
  quoteType: "MUTUALFUND";
  typeDisp: "Fund";
}
export interface SearchQuoteYahooIndex extends SearchQuoteYahoo {
  quoteType: "INDEX";
  typeDisp: "Index";
}
export interface SearchQuoteYahooCurrency extends SearchQuoteYahoo {
  quoteType: "CURRENCY";
  typeDisp: "Currency";
}
export interface SearchQuoteYahooCryptocurrency extends SearchQuoteYahoo {
  quoteType: "CRYPTOCURRENCY";
  typeDisp: "Cryptocurrency";
}

export interface SearchQuoteYahooFuture extends SearchQuoteYahoo {
  quoteType: "FUTURE";
  typeDisp: "Future" | "Futures";
}

export interface SearchQuoteYahooMoneyMarket extends SearchQuoteYahoo {
  quoteType: "MONEY_MARKET";
  typeDisp: "MoneyMarket";
}

export interface SearchQuoteNonYahoo {
  [key: string]: unknown;
  index: string; // '78ddc07626ff4bbcae663e88514c23a0'
  name: string; // 'AAPlasma'
  permalink: string; // 'aaplasma',
  isYahooFinance: false; // false
}

export interface SearchNews {
  [key: string]: unknown;
  uuid: string; // "9aff624a-e84c-35f3-9c23-db39852006dc"
  title: string; // "Analyst Report: Alibaba Group Holding Limited"
  publisher: string; // "Morningstar Research"
  link: string; // "https://finance.yahoo.com/m/9aff624a-e84c-35f3-9c23-db39852006dc/analyst-report%3A-alibaba-group.html"
  providerPublishTime: Date; // coerced to new Date(1611286342 * 1000)
  type: string; // "STORY"    TODO "STORY" | ???
  thumbnail?: { resolutions: SearchNewsThumbnailResolution[] };
  relatedTickers?: string[]; // [ "AAPL" ]
}

export interface SearchNewsThumbnailResolution {
  url: string;
  width: number;
  height: number;
  tag: string;
}

/**
 * Complete search result containing quotes, news, and other information.
 */
export interface SearchResult {
  [key: string]: unknown;

  /** Explanatory information (usually empty) */
  explains: Array<unknown>;

  /** Total number of quote results found */
  count: number;

  /** Array of financial instrument search results */
  quotes: Array<
    | SearchQuoteYahooEquity
    | SearchQuoteYahooOption
    | SearchQuoteYahooETF
    | SearchQuoteYahooFund
    | SearchQuoteYahooIndex
    | SearchQuoteYahooCurrency
    | SearchQuoteYahooCryptocurrency
    | SearchQuoteNonYahoo
    | SearchQuoteYahooFuture
    | SearchQuoteYahooMoneyMarket
  >;

  /** Array of related news articles */
  news: Array<SearchNews>;

  /** Navigation results (structure TBD) */
  nav: Array<unknown>;

  /** List results (structure TBD) */
  lists: Array<unknown>;

  /** Research report results (structure TBD) */
  researchReports: Array<unknown>;

  /** Total time taken for the search request in milliseconds */
  totalTime: number;

  /**
   * Screener field results (structure TBD)
   * @remarks Temporarily optional due to recent API addition
   */
  screenerFieldResults?: Array<unknown>;

  /**
   * Cultural assets results (structure TBD)
   * @remarks Temporarily optional due to recent API addition
   */
  culturalAssets?: Array<unknown>;

  /** Time taken for quote search in milliseconds */
  timeTakenForQuotes: number; // 26

  /** Time taken for news search in milliseconds */
  timeTakenForNews: number; // 419

  /** Time taken for algo watchlist in milliseconds */
  timeTakenForAlgowatchlist: number; // 700

  /** Time taken for predefined screener in milliseconds */
  timeTakenForPredefinedScreener: number; // 400

  /** Time taken for Crunchbase search in milliseconds */
  timeTakenForCrunchbase: number; // 400

  /** Time taken for navigation search in milliseconds */
  timeTakenForNav: number; // 400

  /** Time taken for research reports in milliseconds */
  timeTakenForResearchReports: number; // 0

  /** Time taken for screener field search in milliseconds */
  timeTakenForScreenerField: number;

  /** Time taken for cultural assets search in milliseconds */
  timeTakenForCulturalAssets: number;

  /** Time taken for search lists in milliseconds */
  timeTakenForSearchLists: number; // 0
}

/**
 * Configuration options for search requests.
 */
export interface SearchOptions {
  /** Language code for search results (e.g., "en-US") */
  lang?: string;

  /** Region code for search results (e.g., "US") */
  region?: string;

  /** Maximum number of quote results to return */
  quotesCount?: number;

  /** Maximum number of news results to return */
  newsCount?: number;

  /** Whether to enable fuzzy matching for search terms */
  enableFuzzyQuery?: boolean;

  /** Query ID for quotes search algorithm */
  quotesQueryId?: string;

  /** Query ID for multi-quote search algorithm */
  multiQuoteQueryId?: string;

  /** Query ID for news search algorithm */
  newsQueryId?: string;

  /** Whether to enable Crunchbase results */
  enableCb?: boolean;

  /** Whether to enable navigation links */
  enableNavLinks?: boolean;

  /** Whether to enable enhanced trivial query processing */
  enableEnhancedTrivialQuery?: boolean;
}

const queryOptionsDefaults = {
  lang: "en-US",
  region: "US",
  quotesCount: 6,
  newsCount: 4,
  enableFuzzyQuery: false,
  quotesQueryId: "tss_match_phrase_query",
  multiQuoteQueryId: "multi_quote_single_token_query",
  newsQueryId: "news_cie_vespa",
  enableCb: true,
  enableNavLinks: true,
  enableEnhancedTrivialQuery: true,
};

/**
 * Search for financial instruments with validation enabled.
 *
 * **See the {@link [modules/search] search module} docs for examples and more.**
 * @see {@link [modules/search] search module} docs for examples and more.
 *
 * @param query - Search term (symbol, company name, or keywords)
 * @param queryOptionsOverrides - Optional search configuration
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to validated SearchResult
 */
export default function search(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: SearchOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<SearchResult>;

/**
 * Search for financial instruments with validation disabled.
 *
 * **See the {@link [modules/search] search module} docs for examples and more.**
 * @see {@link [modules/search] search module} docs for examples and more.
 *
 * @param query - Search term (symbol, company name, or keywords)
 * @param queryOptionsOverrides - Optional search configuration
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function search(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: SearchOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

export default function search(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: SearchOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  return this._moduleExec({
    moduleName: "search",

    query: {
      url: "https://${YF_QUERY_HOST}/v1/finance/search",
      definitions,
      schemaKey: "#/definitions/SearchOptions",
      defaults: queryOptionsDefaults,
      runtime: { q: query },
      overrides: queryOptionsOverrides,
    },

    result: {
      definitions,
      schemaKey: "#/definitions/SearchResult",
    },

    moduleOptions,
  });
}
