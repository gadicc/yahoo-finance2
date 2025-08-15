/**
 * Screener module for advanced stock screening and filtering with predefined strategies.
 *
 * This module provides access to Yahoo Finance's stock screener with predefined screening
 * criteria for various investment strategies. Essential for finding stocks that match
 * specific financial criteria, market conditions, or investment themes.
 *
 * @example Basic Usage - Day Gainers
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get today's biggest gainers
 * const gainers = await yahooFinance.screener({
 *   scrIds: "day_gainers",
 *   count: 10
 * });
 *
 * console.log(`Found ${gainers.total} gainers, showing top ${gainers.count}:`);
 * gainers.quotes.forEach((stock, index) => {
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *   console.log(`${index + 1}. ${stock.symbol}: +${change}%`);
 * });
 * ```
 *
 * @example Growth Technology Stocks
 * ```typescript
 * // Screen for growth technology stocks
 * const growthTech = await yahooFinance.screener({
 *   scrIds: "growth_technology_stocks",
 *   count: 20
 * });
 *
 * console.log('Growth Technology Stocks:');
 * growthTech.quotes.forEach(stock => {
 *   console.log(`${stock.symbol}: $${stock.regularMarketPrice.toFixed(2)}`);
 *   console.log(`  Market Cap: $${(stock.marketCap / 1e9).toFixed(2)}B`);
 *   console.log(`  PE Ratio: ${stock.trailingPE?.toFixed(2) || 'N/A'}`);
 * });
 * ```
 *
 * @example Most Active Stocks
 * ```typescript
 * // Find the most actively traded stocks
 * const mostActive = await yahooFinance.screener({
 *   scrIds: "most_actives",
 *   count: 15
 * });
 *
 * console.log('Most Active Stocks:');
 * mostActive.quotes.forEach(stock => {
 *   const volume = (stock.regularMarketVolume / 1e6).toFixed(2);
 *   console.log(`${stock.symbol}: ${volume}M shares traded`);
 * });
 * ```
 *
 * @example Undervalued Large Caps
 * ```typescript
 * // Screen for potentially undervalued large-cap stocks
 * const undervalued = await yahooFinance.screener({
 *   scrIds: "undervalued_large_caps",
 *   count: 25
 * });
 *
 * // Analyze value metrics
 * console.log('Undervalued Large Cap Analysis:');
 * undervalued.quotes.forEach(stock => {
 *   const pe = stock.trailingPE;
 *   const pb = stock.priceToBook;
 *   const marketCap = stock.marketCap / 1e9;
 *
 *   console.log(`${stock.symbol}:`);
 *   console.log(`  Market Cap: $${marketCap.toFixed(2)}B`);
 *   console.log(`  P/E: ${pe?.toFixed(2) || 'N/A'}`);
 *   console.log(`  P/B: ${pb?.toFixed(2) || 'N/A'}`);
 * });
 * ```
 *
 * @example Small Cap Gainers
 * ```typescript
 * // Find small-cap stocks with strong performance
 * const smallCapGainers = await yahooFinance.screener({
 *   scrIds: "small_cap_gainers",
 *   count: 20
 * });
 *
 * // Filter by market cap and volume for liquidity
 * const liquidSmallCaps = smallCapGainers.quotes.filter(stock =>
 *   stock.marketCap > 300e6 && // > $300M market cap
 *   stock.regularMarketVolume > 100000 // > 100k daily volume
 * );
 *
 * console.log('Liquid Small Cap Gainers:');
 * liquidSmallCaps.forEach(stock => {
 *   const marketCap = (stock.marketCap / 1e6).toFixed(0);
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *   console.log(`${stock.symbol}: +${change}% (${marketCap}M cap)`);
 * });
 * ```
 *
 * @example High Yield Bonds Analysis
 * ```typescript
 * // Screen for high-yield bond funds
 * const highYieldBonds = await yahooFinance.screener({
 *   scrIds: "high_yield_bond",
 *   count: 30
 * });
 *
 * console.log('High Yield Bond Analysis:');
 * highYieldBonds.quotes.forEach(fund => {
 *   const yield = fund.trailingAnnualDividendYield;
 *   if (yield) {
 *     console.log(`${fund.symbol}: ${(yield * 100).toFixed(2)}% yield`);
 *   }
 * });
 * ```
 *
 * @example Regional Market Screening
 * ```typescript
 * // Screen stocks in different regions
 * const regions = [
 *   { region: 'US', lang: 'en-US' },
 *   { region: 'GB', lang: 'en-GB' },
 *   { region: 'DE', lang: 'de-DE' }
 * ];
 *
 * for (const regionConfig of regions) {
 *   const dayGainers = await yahooFinance.screener({
 *     scrIds: "day_gainers",
 *     count: 5,
 *     ...regionConfig
 *   });
 *
 *   console.log(`\nTop gainers in ${regionConfig.region}:`);
 *   dayGainers.quotes.forEach(stock => {
 *     const change = stock.regularMarketChangePercent.toFixed(2);
 *     console.log(`${stock.symbol}: +${change}%`);
 *   });
 * }
 * ```
 *
 * @example Most Shorted Stocks Analysis
 * ```typescript
 * // Analyze heavily shorted stocks
 * const mostShorted = await yahooFinance.screener({
 *   scrIds: "most_shorted_stocks",
 *   count: 25
 * });
 *
 * console.log('Most Shorted Stocks Analysis:');
 * mostShorted.quotes.forEach(stock => {
 *   const price = stock.regularMarketPrice.toFixed(2);
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *
 *   console.log(`${stock.symbol}: $${price} (${change}%)`);
 *
 *   // Additional analysis could include short interest ratio
 *   // This would require additional API calls to get detailed data
 * });
 * ```
 *
 * @example Conservative Investment Screening
 * ```typescript
 * // Screen for conservative investments
 * const conservativeFunds = await yahooFinance.screener({
 *   scrIds: "conservative_foreign_funds",
 *   count: 15
 * });
 *
 * const portfolioAnchors = await yahooFinance.screener({
 *   scrIds: "portfolio_anchors",
 *   count: 15
 * });
 *
 * console.log('Conservative Investment Options:');
 * console.log('\nConservative Foreign Funds:');
 * conservativeFunds.quotes.slice(0, 5).forEach(fund => {
 *   console.log(`${fund.symbol}: ${fund.shortName}`);
 * });
 *
 * console.log('\nPortfolio Anchors:');
 * portfolioAnchors.quotes.slice(0, 5).forEach(stock => {
 *   console.log(`${stock.symbol}: ${stock.shortName}`);
 * });
 * ```
 *
 * @example Mutual Fund Analysis
 * ```typescript
 * // Analyze top-performing mutual funds
 * const topMutualFunds = await yahooFinance.screener({
 *   scrIds: "top_mutual_funds",
 *   count: 20
 * });
 *
 * const solidLargeGrowth = await yahooFinance.screener({
 *   scrIds: "solid_large_growth_funds",
 *   count: 15
 * });
 *
 * const solidMidcap = await yahooFinance.screener({
 *   scrIds: "solid_midcap_growth_funds",
 *   count: 15
 * });
 *
 * console.log('Mutual Fund Analysis:');
 * [
 *   { name: 'Top Mutual Funds', data: topMutualFunds },
 *   { name: 'Large Growth Funds', data: solidLargeGrowth },
 *   { name: 'Midcap Growth Funds', data: solidMidcap }
 * ].forEach(category => {
 *   console.log(`\n${category.name}:`);
 *   category.data.quotes.slice(0, 3).forEach(fund => {
 *     console.log(`  ${fund.symbol}: ${fund.shortName}`);
 *   });
 * });
 * ```
 *
 * @example Aggressive Growth Strategy
 * ```typescript
 * // Screen for aggressive growth opportunities
 * const aggressiveSmallCaps = await yahooFinance.screener({
 *   scrIds: "aggressive_small_caps",
 *   count: 30
 * });
 *
 * // Filter for strong recent performance
 * const strongPerformers = aggressiveSmallCaps.quotes.filter(stock =>
 *   stock.regularMarketChangePercent > 2 && // Up more than 2% today
 *   stock.regularMarketVolume > 500000 &&   // Good volume
 *   stock.marketCap > 100e6                 // Minimum $100M market cap
 * );
 *
 * console.log('Aggressive Small Cap Opportunities:');
 * strongPerformers.forEach(stock => {
 *   const change = stock.regularMarketChangePercent.toFixed(2);
 *   const marketCap = (stock.marketCap / 1e6).toFixed(0);
 *   const volume = (stock.regularMarketVolume / 1e3).toFixed(0);
 *
 *   console.log(`${stock.symbol}: +${change}% | ${marketCap}M cap | ${volume}k vol`);
 * });
 * ```
 *
 * @remarks
 * **Available Screen IDs**: The module supports multiple predefined screens:
 * - `day_gainers` / `day_losers` - Daily price movers
 * - `most_actives` - Highest volume stocks
 * - `growth_technology_stocks` - Tech growth companies
 * - `undervalued_large_caps` / `undervalued_growth_stocks` - Value opportunities
 * - `aggressive_small_caps` / `small_cap_gainers` - Small-cap opportunities
 * - `most_shorted_stocks` - Heavily shorted stocks
 * - `portfolio_anchors` - Stable large-cap stocks
 * - `high_yield_bond` - High-yield bond funds
 * - `top_mutual_funds` / `solid_large_growth_funds` / `solid_midcap_growth_funds` - Fund categories
 * - `conservative_foreign_funds` - Conservative international funds
 *
 * **Data Quality**: Screening results are updated regularly but may have slight
 * delays. Always verify current prices before making investment decisions.
 *
 * **Regional Support**: Most screens support regional parameters for
 * international markets (US, GB, DE, etc.).
 *
 * **Result Limits**: The `count` parameter controls how many results to return.
 * Higher counts may take longer to process.
 *
 * **Filtering**: Results can be further filtered in your code based on specific
 * criteria like market cap, volume, price ranges, or financial ratios.
 *
 * @see {@link quote} for detailed stock information
 * @see {@link quoteSummary} for comprehensive fundamental data
 *
 * @module screener
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./screener.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

export interface ScreenerResultBase {
  id: string;
  title: string;
  description: string;
  canonicalName: string;
  criteriaMeta: ScreenerCriteriaMeta;
  rawCriteria: string;
  start: number;
  count: number;
  total: number;
  quotes: ScreenerQuote[];
  useRecords: boolean;
  predefinedScr: boolean;
  versionId: number;
  creationDate: number;
  lastUpdated: number;
  isPremium: boolean;
  iconUrl: string;
}

export interface ScreenerResultAggressiveSmallCaps extends ScreenerResultBase {
  canonicalName: "AGGRESSIVE_SMALL_CAPS";
}

export interface ScreenerResultConservativeForeignFunds
  extends ScreenerResultBase {
  canonicalName: "CONSERVATIVE_FOREIGN_FUNDS";
  criteriaMeta: ScreenerCriteriaMeta & {
    includeFields: (
      | "fundnetassets"
      | "sold_proportion"
      | "annualreportnetexpenseratio"
      | "performanceratingoverall"
      | "intradaypricechange"
      | "bought_proportion"
      | "fiftytwowkhigh"
      | "fiftydaymovingavg"
      | "ticker"
      | "longname_us_en-us"
      | "percentchange"
      | "companyshortname"
      | "intradayprice"
      | "annualreturnnavy5"
      | "day_open_price"
      | "annualreturnnavy3"
      | "annualreturnnavy1"
      | "annualreportgrossexpenseratio"
      | "twohundreddaymovingavg"
      | "pe_ttm"
      | "yield_ttm"
      | "exchange"
      | "fiftytwowklow"
      | "riskratingoverall"
      | "trailing_ytd_return"
      | "trailing_3m_return"
      | "annualreturnnavy1categoryrank"
      | "categoryname"
      | "performanceratingoverall"
      | "exchange"
      | "riskratingoverall"
      | "initialinvestment"
    )[];
  };
}

type ScreenerCriteriaFieldDaily =
  | "change_in_number_of_institutional_holders"
  | "trading_central_last_close_price_to_fair_value"
  | "intradaypricechange"
  | "estimated_revenue_growth"
  | "intradaymarketcap"
  | "morningstar_previous_rating"
  | "fiftytwowkhigh"
  | "pctheldinst"
  | "morningstar_last_close_price_to_fair_value"
  | "shares_bought_by_funds"
  | "ror_percent"
  | "morningstar_rating"
  | "sector"
  | "peratio.lasttwelvemonths"
  | "bullish_proportion"
  | "percent_change_in_number_of_institutional_holders"
  | "number_of_institutional_sellers"
  | "morningstar_stewardship"
  | "lastclosetevebit.lasttwelvemonths"
  | "percentchange"
  | "morningstar_economic_moat"
  | "percent_of_shares_outstanding_bought_by_institutions"
  | "day_open_price"
  | "morningstar_rating_change"
  | "number_of_institutional_holders"
  | "percent_in_funds_holding"
  | "exchange"
  | "percent_of_shares_outstanding_sold_by_institutions"
  | "dayvolume"
  | "bearish_proportion"
  | "morningstar_fair_value"
  | "sold_proportion"
  | "industry"
  | "morningstar_uncertainty"
  | "shares_sold_by_funds"
  | "fair_value"
  | "bought_proportion"
  | "percent_in_top_ten_holdings"
  | "avgdailyvol3m"
  | "last_close_price_to_nnwc_per_share"
  | "estimated_earnings_growth"
  | "ticker"
  | "longname_us_en-us"
  | "percent_change_in_shares_held_by_funds"
  | "number_of_institutional_buyers"
  | "companyshortname"
  | "intradayprice"
  | "change_in_shares_held_by_funds"
  | "indices"
  | "neutral_proportion"
  | "latest_holdings_report_date"
  | "fiftytwowklow"
  | "value_description"
  | "average_analyst_rating"
  | "intradaymarketcap"
  | "percentchange"
  | "intradayprice"
  | "region"
  | "dayvolume";

export interface ScreenerResultDayGainers extends ScreenerResultBase {
  canonicalName: "DAY_GAINERS";
  criteriaMeta: ScreenerCriteriaMeta & {
    includeFields: ScreenerCriteriaFieldDaily[];
  };
}

export interface ScreenerResultDayLosers extends ScreenerResultBase {
  canonicalName: "DAY_LOSERS";
  criteriaMeta: ScreenerCriteriaMeta & {
    includeFields: ScreenerCriteriaFieldDaily[];
  };
}

/**
 * @discriminator canonicalName
 */
export type ScreenerResult =
  | ScreenerResultAggressiveSmallCaps
  | ScreenerResultConservativeForeignFunds
  | ScreenerResultDayGainers
  | ScreenerResultDayLosers;

export interface ScreenerCriteriaMeta {
  size: number;
  offset: number;
  sortField: string;
  sortType: string;
  quoteType: string;
  criteria: ScreenerCriterum[];
  topOperator: string;
}

export interface ScreenerCriterum {
  field: string;
  operators: string[];
  values: number[];
  labelsSelected: number[];
  dependentValues: unknown[];
  subField?: null;
}

export interface ScreenerQuote {
  language: string;
  region: string;
  quoteType: string;
  typeDisp: string;
  quoteSourceName?: string;
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
  regularMarketDayHigh?: number;
  regularMarketDayRange?: string;
  currency: string;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  market: string;
  messageBoardId: string;
  fullExchangeName: string;
  longName: string;
  financialCurrency?: string;
  regularMarketOpen?: number;
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
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;
  marketState: string;
  epsTrailingTwelveMonths?: number;
  epsForward?: number;
  epsCurrentYear?: number;
  priceEpsCurrentYear?: number;
  sharesOutstanding?: number;
  bookValue?: number;
  fiftyDayAverage: number;
  fiftyDayAverageChange: number;
  fiftyDayAverageChangePercent: number;
  twoHundredDayAverage: number;
  twoHundredDayAverageChange: number;
  twoHundredDayAverageChangePercent: number;
  marketCap?: number;
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
  nameChangeDate?: number;
  ipoExpectedDate?: number;
  dividendYield?: number;
  dividendRate?: number;
  yieldTTM?: number;
  peTTM?: number;
  annualReturnNavY3?: number;
  annualReturnNavY5?: number;
  ytdReturn?: number;
  trailingThreeMonthReturns?: number;
  netAssets?: number;
  netExpenseRatio?: number;
  hasPrePostMarketData?: boolean; // true
  corporateActions?: unknown[]; // []
  earningsCallTimestampStart?: Date; // 1739453400
  earningsCallTimestampEnd?: Date; //  1739453400
  isEarningsDateEstimate?: boolean; // true
  preMarketChange?: number; // -0.010000229,
  preMarketChangePercent?: number; // -0.34723017
  preMarketTime?: Date; // 1740480444
  preMarketPrice?: number; // 2.87
}

export type PredefinedScreenerModules =
  | "aggressive_small_caps"
  | "conservative_foreign_funds"
  | "day_gainers"
  | "day_losers"
  | "growth_technology_stocks"
  | "high_yield_bond"
  | "most_actives"
  | "most_shorted_stocks"
  | "portfolio_anchors"
  | "small_cap_gainers"
  | "solid_large_growth_funds"
  | "solid_midcap_growth_funds"
  | "top_mutual_funds"
  | "undervalued_growth_stocks"
  | "undervalued_large_caps";

const queryOptionsDefaults = {
  lang: "en-US",
  region: "US",
  scrIds: "day_gainers",
  count: 5,
};

export interface ScreenerOptions {
  lang?: string;
  region?: string;
  scrIds: PredefinedScreenerModules;
  count?: number;
}

export default function screener(
  this: ModuleThis,
  queryOptionsOverrides?: PredefinedScreenerModules | ScreenerOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<ScreenerResult>;

export default function screener(
  this: ModuleThis,
  queryOptionsOverrides?: PredefinedScreenerModules | ScreenerOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

export default function screener(
  this: ModuleThis,
  queryOptionsOverrides?: PredefinedScreenerModules | ScreenerOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  if (typeof queryOptionsOverrides === "string") {
    queryOptionsOverrides = { scrIds: queryOptionsOverrides };
  }

  return this._moduleExec({
    moduleName: "screener",
    query: {
      url: "https://${YF_QUERY_HOST}/v1/finance/screener/predefined/saved",
      definitions,
      schemaKey: "#/definitions/ScreenerOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      needsCrumb: true,
    },
    result: {
      definitions,
      schemaKey: "#/definitions/ScreenerResult",
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

// aggressive_small_caps
// conservative_foreign_funds
// day_gainers
// day_losers
// growth_technology_stocks
// high_yield_bond
// most_actives
// most_shorted_stocks
// portfolio_anchors
// small_cap_gainers
// solid_large_growth_funds
// solid_midcap_growth_funds
// top_mutual_funds
// undervalued_growth_stocks
// undervalued_large_caps
