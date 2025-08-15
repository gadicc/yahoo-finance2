/**
 * Quote Summary module for retrieving comprehensive financial data.
 *
 * This module provides detailed financial information for symbols including
 * price data, company profile, financial statements, recommendations, and more.
 * It's modular - you can request only the specific data modules you need.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Default modules: price + summaryDetail
 * const result = await yahooFinance.quoteSummary('AAPL');
 * console.log(result.price?.regularMarketPrice);
 * console.log(result.summaryDetail?.marketCap);
 *
 * // Request specific modules
 * const profile = await yahooFinance.quoteSummary('AAPL', {
 *   modules: ['summaryProfile', 'financialData']
 * });
 * console.log(profile.summaryProfile?.longBusinessSummary);
 *
 * // Get all available modules
 * const comprehensive = await yahooFinance.quoteSummary('AAPL', {
 *   modules: 'all'
 * });
 * ```
 *
 * @example Available Modules
 * ```typescript
 * // Financial statements
 * const financials = await yahooFinance.quoteSummary('AAPL', {
 *   modules: [
 *     'incomeStatementHistory',
 *     'balanceSheetHistory',
 *     'cashflowStatementHistory'
 *   ]
 * });
 *
 * // Analyst data
 * const analysis = await yahooFinance.quoteSummary('AAPL', {
 *   modules: ['recommendationTrend', 'upgradeDowngradeHistory']
 * });
 *
 * // Holdings data for funds/ETFs
 * const holdings = await yahooFinance.quoteSummary('SPY', {
 *   modules: ['topHoldings', 'fundProfile']
 * });
 * ```
 *
 * @remarks
 * **Note**: In the original `node-yahoo-finance` v1, this was incorrectly
 * called "quote". The actual quote data is now in the {@link quote} module.
 * This module provides much more comprehensive data than basic quotes.
 *
 * @module quoteSummary
 */

import type { QuoteSummaryResult } from "./quoteSummary-iface.ts";

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";
export type * from "./quoteSummary-iface.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import optsSchema from "./quoteSummary.schema.json" with { type: "json" };
import resultsSchema from "./quoteSummary-iface.schema.json" with {
  type: "json",
};
const optsDefinitions = getTypedDefinitions(optsSchema);
const resultsDefinitions = getTypedDefinitions(resultsSchema);

/**
 * Available quote summary modules for requesting specific data.
 *
 * Each module provides different types of financial data:
 * - **Company Info**: `assetProfile`, `summaryProfile`, `quoteType`
 * - **Price Data**: `price`, `summaryDetail`
 * - **Financial Statements**: `incomeStatementHistory*`, `balanceSheetHistory*`, `cashflowStatementHistory*`
 * - **Analysis**: `recommendationTrend`, `upgradeDowngradeHistory`, `earnings*`
 * - **Ownership**: `institutionOwnership`, `fundOwnership`, `majorHoldersBreakdown`
 * - **Fund Specific**: `fundProfile`, `fundPerformance`, `topHoldings`
 * - **Other**: `calendarEvents`, `defaultKeyStatistics`, `financialData`
 *
 * Modules ending with "*" have both regular and quarterly versions.
 */
export const quoteSummary_modules = [
  "assetProfile",
  "balanceSheetHistory",
  "balanceSheetHistoryQuarterly",
  "calendarEvents",
  "cashflowStatementHistory",
  "cashflowStatementHistoryQuarterly",
  "defaultKeyStatistics",
  "earnings",
  "earningsHistory",
  "earningsTrend",
  "financialData",
  "fundOwnership",
  "fundPerformance",
  "fundProfile",
  "incomeStatementHistory",
  "incomeStatementHistoryQuarterly",
  "indexTrend",
  "industryTrend",
  "insiderHolders",
  "insiderTransactions",
  "institutionOwnership",
  "majorDirectHolders",
  "majorHoldersBreakdown",
  "netSharePurchaseActivity",
  "price",
  "quoteType",
  "recommendationTrend",
  "secFilings",
  "sectorTrend",
  "summaryDetail",
  "summaryProfile",
  "topHoldings",
  "upgradeDowngradeHistory",
];

/**
 * Type union of all available quote summary module names.
 * Use this to specify which modules to include in your request.
 */
export type QuoteSummaryModules =
  | "assetProfile"
  | "balanceSheetHistory"
  | "balanceSheetHistoryQuarterly"
  | "calendarEvents"
  | "cashflowStatementHistory"
  | "cashflowStatementHistoryQuarterly"
  | "defaultKeyStatistics"
  | "earnings"
  | "earningsHistory"
  | "earningsTrend"
  | "financialData"
  | "fundOwnership"
  | "fundPerformance"
  | "fundProfile"
  | "incomeStatementHistory"
  | "incomeStatementHistoryQuarterly"
  | "indexTrend"
  | "industryTrend"
  | "insiderHolders"
  | "insiderTransactions"
  | "institutionOwnership"
  | "majorDirectHolders"
  | "majorHoldersBreakdown"
  | "netSharePurchaseActivity"
  | "price"
  | "quoteType"
  | "recommendationTrend"
  | "secFilings"
  | "sectorTrend"
  | "summaryDetail"
  | "summaryProfile"
  | "topHoldings"
  | "upgradeDowngradeHistory";

/**
 * Configuration options for quote summary requests.
 */
export interface QuoteSummaryOptions {
  /**
   * Whether to return formatted strings instead of raw numbers.
   * When true, numbers like 1000000 become "1.00M".
   * @defaultValue false
   */
  formatted?: boolean;

  /**
   * Which data modules to include in the response.
   * - Array of specific module names for targeted data
   * - "all" to get all available modules
   * @defaultValue ["price", "summaryDetail"]
   */
  modules?: Array<QuoteSummaryModules> | "all";
}

const queryOptionsDefaults = {
  formatted: false,
  modules: ["price", "summaryDetail"],
};

/**
 * Get comprehensive quote summary data with validation enabled.
 *
 * @param symbol - Stock symbol to get data for
 * @param queryOptionsOverrides - Optional configuration for modules and formatting
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to validated QuoteSummaryResult
 */
export default function quoteSummary(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: QuoteSummaryOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<QuoteSummaryResult>;

/**
 * Get comprehensive quote summary data with validation disabled.
 *
 * @param symbol - Stock symbol to get data for
 * @param queryOptionsOverrides - Optional configuration for modules and formatting
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function quoteSummary(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: QuoteSummaryOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

/**
 * Get comprehensive financial data and analysis for a single symbol.
 *
 * This function provides detailed financial information including company profiles,
 * financial statements, analyst recommendations, ownership data, and more. The data
 * is organized into modules that you can selectively request.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get default modules (price + summaryDetail)
 * const basic = await yahooFinance.quoteSummary('AAPL');
 * console.log(basic.price?.regularMarketPrice);
 * console.log(basic.summaryDetail?.marketCap);
 * ```
 *
 * @example Company Information
 * ```typescript
 * const profile = await yahooFinance.quoteSummary('AAPL', {
 *   modules: ['summaryProfile', 'assetProfile']
 * });
 * console.log(profile.summaryProfile?.longBusinessSummary);
 * console.log(profile.assetProfile?.fullTimeEmployees);
 * ```
 *
 * @example Financial Statements
 * ```typescript
 * const financials = await yahooFinance.quoteSummary('AAPL', {
 *   modules: [
 *     'incomeStatementHistory',
 *     'balanceSheetHistory',
 *     'cashflowStatementHistory'
 *   ]
 * });
 * const latestIncome = financials.incomeStatementHistory?.incomeStatementHistory[0];
 * ```
 *
 * @example Analyst Data
 * ```typescript
 * const analysis = await yahooFinance.quoteSummary('AAPL', {
 *   modules: ['recommendationTrend', 'upgradeDowngradeHistory', 'earningsTrend']
 * });
 * console.log(analysis.recommendationTrend?.trend);
 * ```
 *
 * @example Fund/ETF Data
 * ```typescript
 * const fund = await yahooFinance.quoteSummary('SPY', {
 *   modules: ['fundProfile', 'topHoldings', 'fundPerformance']
 * });
 * console.log(fund.topHoldings?.holdings);
 * ```
 *
 * @example All Available Data
 * ```typescript
 * const everything = await yahooFinance.quoteSummary('AAPL', {
 *   modules: 'all'
 * });
 * // Contains all available modules for the symbol
 * ```
 *
 * @param symbol - Stock, ETF, mutual fund, or other financial instrument symbol.
 *                 Use search() to find valid symbols.
 * @param queryOptionsOverrides - Optional configuration:
 *                                - `modules`: Specific data modules to request
 *                                - `formatted`: Return formatted strings vs raw numbers
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 *
 * @returns Promise that resolves to a QuoteSummaryResult object containing
 *          the requested modules as properties. Properties will be undefined
 *          if the module wasn't requested or isn't available for the symbol.
 *
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid symbol
 *         - Validation fails (if enabled)
 *
 * @remarks
 * **Module Categories:**
 * - **Core**: `price`, `summaryDetail`, `quoteType` (basic info)
 * - **Profile**: `summaryProfile`, `assetProfile` (company info)
 * - **Financials**: `*StatementHistory*` modules (financial statements)
 * - **Analysis**: `recommendation*`, `earnings*`, `upgrade*` (analyst data)
 * - **Ownership**: `*Ownership`, `*Holders*` (shareholder info)
 * - **Fund**: `fund*`, `topHoldings` (fund/ETF specific)
 *
 * **Performance Note**: Requesting fewer modules improves response time.
 * Only request the modules you actually need.
 *
 * @see {@link QuoteSummaryOptions} for all available options
 * @see {@link QuoteSummaryResult} for result structure
 * @see {@link quoteSummary_modules} for list of all available modules
 */
export default function quoteSummary(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: QuoteSummaryOptions,
  moduleOptions?: ModuleOptions,
): Promise<QuoteSummaryResult> {
  return this._moduleExec({
    moduleName: "quoteSummary",

    query: {
      assertSymbol: symbol,
      url: "https://${YF_QUERY_HOST}/v10/finance/quoteSummary/" + symbol,
      needsCrumb: true,
      definitions: optsDefinitions,
      schemaKey: "#/definitions/QuoteSummaryOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      transformWith(options: QuoteSummaryOptions) {
        if (options.modules === "all") {
          options.modules = quoteSummary_modules as Array<QuoteSummaryModules>;
        }
        return options;
      },
    },

    result: {
      definitions: resultsDefinitions,
      schemaKey: "#/definitions/QuoteSummaryResult",
      // deno-lint-ignore no-explicit-any
      transformWith(result: any) {
        if (!result.quoteSummary) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }

        return result.quoteSummary.result[0];
      },
    },

    moduleOptions,
  });
}
