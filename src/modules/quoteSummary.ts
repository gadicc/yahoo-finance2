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
 * ### Available Modules
 *
 * See {@linkcode quoteSummary_modules} for the full list.
 *
 * ### Notes
 * * In the original **node-yahoo-finance v1**, this was incorrectly called "quote".
 *   The actual quote data is now in the {@linkcode [modules/quote] quote} module.
 *   This module provides much more comprehensive data than basic quotes.
 *
 * * **Performance**: requesting fewer modules improves response time.
 * Only request the modules you actually need.
 *
 * * **Financial Statements**: Since Nov 2024, the ~~`incomeStatementHistory*`~~,
 *   ~~`balanceSheetHistory*`~~, ~~`cashflowStatementHistory*`~~ modules provide
 *   almost no data.  Use the
 *   {@linkcode [modules/fundamentalsTimeSeries] fundamentalsTimeSeries}
 *   module instead.
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
import type { YahooFinance } from "../createYahooFinance.ts";

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
 * - **Financial Statements**: ~~`incomeStatementHistory*`~~,
 *   ~~`balanceSheetHistory*`~~, ~~`cashflowStatementHistory*`~~. *Use
 *   {@linkcode [modules/fundamentalsTimeSeries] fundamentalsTimeSeries} instead!*
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
  "esgScores",
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
  | "esgScores"
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
 * **See the {@link [modules/quoteSummary] quoteSummary module} docs for examples and more.**
 * @see {@link [modules/quoteSummary] quoteSummary module} docs for examples and more.
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
 * **See the {@link [modules/quoteSummary] quoteSummary module} docs for examples and more.**
 * @see {@link [modules/quoteSummary] quoteSummary module} docs for examples and more.
 *
 * @param symbol - Stock symbol to get data for
 * @param queryOptionsOverrides - Optional configuration for modules and formatting
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data, but resembling {@linkcode QuoteSummaryResult}.
 */
export default function quoteSummary(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: QuoteSummaryOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

/**
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
  const financeModules: QuoteSummaryModules[] = [
    "balanceSheetHistory",
    "balanceSheetHistoryQuarterly",
    "cashflowStatementHistory",
    "cashflowStatementHistoryQuarterly",
    "incomeStatementHistory",
    "incomeStatementHistoryQuarterly",
  ];
  const usedFinanceModules = financeModules.filter((m) =>
    queryOptionsOverrides?.modules?.includes(m)
  );
  if (usedFinanceModules.length) {
    // TODO https://github.com/gadicc/yahoo-finance2/issues/950
    const yahooFinance = this as unknown as YahooFinance;

    yahooFinance._opts.logger!.warn(
      "QuoteSummary financial statements submodules like " +
        usedFinanceModules.join(", ") +
        " have provided almost no data since Nov 2024. Use `fundamentalsTimeSeries` instead.",
    );
  }

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
