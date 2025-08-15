/**
 * Insights module for retrieving analyst insights, reports, and company analysis.
 *
 * This module provides access to research reports, analyst recommendations,
 * significant developments, and other insights for financial instruments.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get insights for a symbol
 * const insights = await yahooFinance.insights('AAPL');
 * console.log(insights.recommendation); // { rating: "BUY", targetPrice: 200, ... }
 * console.log(insights.sigDevs[0]); // Recent significant development
 * ```
 *
 * @example Working with Reports
 * ```typescript
 * const insights = await yahooFinance.insights('TSLA');
 *
 * // Browse research reports
 * insights.reports?.forEach(report => {
 *   console.log(`${report.reportTitle} by ${report.provider}`);
 *   console.log(`Date: ${report.reportDate}`);
 * });
 *
 * // Check significant developments
 * insights.sigDevs.forEach(dev => {
 *   console.log(`${dev.date}: ${dev.headline}`);
 * });
 * ```
 *
 * @remarks
 * **Data Availability**: Insights data availability varies by symbol.
 * Premium content may require additional subscriptions.
 *
 * @module insights
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import type { DateInMs } from "../lib/commonTypes.ts";
import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
// @ts-ignore: tmp
import schema from "./insights.schema.json" with { type: "json" };
const definitions = getTypedDefinitions(schema);

/**
 * Complete insights result for a financial instrument.
 */
export interface InsightsResult {
  [key: string]: unknown;

  /** Symbol for which insights are provided */
  symbol: string;

  /** Basic instrument information */
  instrumentInfo?: InsightsInstrumentInfo;

  /** Company snapshot information */
  companySnapshot?: InsightsCompanySnapshot;

  /** Current analyst recommendation */
  recommendation?: {
    /** Target price from analysts */
    targetPrice?: number;
    /** Research provider */
    provider: string;
    /** Overall rating recommendation */
    rating: "BUY" | "SELL" | "HOLD";
  };

  /** Upcoming events */
  events?: InsightsEvent[];

  /** Research reports */
  reports?: InsightsReport[];

  /** Significant developments */
  sigDevs: InsightsSigDev[];

  /** Upsell information */
  upsell?: InsightsUpsell;

  /** Additional research reports */
  upsellSearchDD?: {
    researchReports: InsightsResearchReport;
  };

  /** SEC filing reports */
  secReports?: InsightsSecReport[];
}

/**
 * Significant development item.
 */
export interface InsightsSigDev {
  [key: string]: unknown;

  /** Headline of the development */
  headline: string;

  /** Date of the development */
  date: Date;
}

export interface InsightsReport {
  [key: string]: unknown;
  id: string;
  title?: string;
  headHtml: string;
  provider: string;
  reportDate: Date;
  reportTitle: string;
  reportType: string;
  targetPrice?: number;
  targetPriceStatus?: "Increased" | "Maintained" | "Decreased" | "-";
  investmentRating?: "Bullish" | "Neutral" | "Bearish";
  tickers?: string[];
}

export interface InsightsResearchReport {
  reportId: string;
  provider: string;
  title: string;
  reportDate: Date;
  summary: string;
  investmentRating?: "Bullish" | "Neutral" | "Bearish";
}

export interface InsightsSecReport {
  id: string;
  type: string;
  title: string;
  description: string;
  filingDate: DateInMs;
  snapshotUrl: string;
  formType: string;
}

export interface InsightsEvent {
  [key: string]: unknown;
  eventType: string;
  pricePeriod: string;
  tradingHorizon: string;
  tradeType: string;
  imageUrl: string;
  startDate: Date;
  endDate: Date;
}

export interface InsightsInstrumentInfo {
  [key: string]: unknown;
  keyTechnicals: {
    [key: string]: unknown;
    provider: string;
    support?: number;
    resistance?: number;
    stopLoss?: number;
  };
  technicalEvents: {
    [key: string]: unknown;
    provider: string;
    sector?: string;
    shortTermOutlook: InsightsOutlook;
    intermediateTermOutlook: InsightsOutlook;
    longTermOutlook: InsightsOutlook;
  };
  valuation: {
    [key: string]: unknown;
    color?: number;
    description?: string;
    discount?: string;
    provider: string;
    relativeValue?: string;
  };
}

export interface InsightsCompanySnapshot {
  [key: string]: unknown;
  sectorInfo?: string;
  company: {
    [key: string]: unknown;
    innovativeness?: number;
    hiring?: number;
    sustainability?: number;
    insiderSentiments?: number;
    earningsReports?: number;
    dividends?: number;
  };
  sector: {
    [key: string]: unknown;
    innovativeness: number;
    hiring: number;
    sustainability?: number;
    insiderSentiments: number;
    earningsReports?: number;
    dividends: number;
  };
}

export type InsightsDirection = "Bearish" | "Bullish" | "Neutral";

export interface InsightsOutlook {
  [key: string]: unknown;
  stateDescription: string;
  direction: InsightsDirection;
  score: number;
  scoreDescription: string;
  sectorDirection?: InsightsDirection;
  sectorScore?: number;
  sectorScoreDescription?: string;
  indexDirection: InsightsDirection;
  indexScore: number;
  indexScoreDescription: string;
}

export interface InsightsUpsell {
  [key: string]: unknown;
  msBullishSummary?: Array<string>;
  msBearishSummary?: Array<string>;
  msBullishBearishSummariesPublishDate?: DateInMs;
  companyName?: string; // Missing in e.g. APS.AX
  upsellReportType?: string;
}

/**
 * Configuration options for insights requests.
 */
export interface InsightsOptions {
  /** Language code for results (e.g., "en-US") */
  lang?: string;

  /** Region code for results (e.g., "US") */
  region?: string;

  /** Number of research reports to include */
  reportsCount?: number;
}

const queryOptionsDefaults = {
  lang: "en-US",
  region: "US",
  getAllResearchReports: true,
  reportsCount: 2,
};

/**
 * Get insights with validation enabled.
 *
 * @param symbol - Stock symbol to get insights for
 * @param queryOptionsOverrides - Optional configuration for language, region, and report count
 * @param moduleOptions - Optional module configuration
 * @returns Promise resolving to validated InsightsResult
 */
export default function insights(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: InsightsOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<InsightsResult>;

/**
 * Get insights with validation disabled.
 *
 * @param symbol - Stock symbol to get insights for
 * @param queryOptionsOverrides - Optional configuration for language, region, and report count
 * @param moduleOptions - Module configuration with validateResult: false
 * @returns Promise resolving to unvalidated raw data
 */
export default function insights(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: InsightsOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

/**
 * Get analyst insights, research reports, and analysis for a financial instrument.
 *
 * This function retrieves comprehensive analyst coverage including recommendations,
 * research reports, significant developments, and company analysis scores.
 *
 * @example Basic Usage
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get insights for a symbol
 * const insights = await yahooFinance.insights('AAPL');
 *
 * // Check analyst recommendation
 * if (insights.recommendation) {
 *   console.log(`Rating: ${insights.recommendation.rating}`);
 *   console.log(`Target Price: $${insights.recommendation.targetPrice}`);
 * }
 *
 * // Review significant developments
 * insights.sigDevs.forEach(dev => {
 *   console.log(`${dev.date.toISOString().split('T')[0]}: ${dev.headline}`);
 * });
 * ```
 *
 * @example Research Reports
 * ```typescript
 * const insights = await yahooFinance.insights('TSLA', {
 *   reportsCount: 5
 * });
 *
 * // Browse research reports
 * insights.reports?.forEach(report => {
 *   console.log(`${report.reportTitle} - ${report.provider}`);
 *   console.log(`Published: ${report.reportDate}`);
 *   console.log(`Rating: ${report.investmentRating}`);
 *   if (report.targetPrice) {
 *     console.log(`Target: $${report.targetPrice}`);
 *   }
 * });
 * ```
 *
 * @example Company Analysis
 * ```typescript
 * const insights = await yahooFinance.insights('MSFT');
 *
 * // Company performance vs sector
 * if (insights.companySnapshot) {
 *   const company = insights.companySnapshot.company;
 *   const sector = insights.companySnapshot.sector;
 *
 *   console.log('Company vs Sector Scores:');
 *   console.log(`Innovation: ${company.innovativeness} vs ${sector.innovativeness}`);
 *   console.log(`Hiring: ${company.hiring} vs ${sector.hiring}`);
 *   console.log(`Sustainability: ${company.sustainability} vs ${sector.sustainability}`);
 * }
 * ```
 *
 * @param symbol - Stock symbol to get insights for.
 *                 Use search() to find valid symbols.
 * @param queryOptionsOverrides - Optional configuration:
 *                                - `reportsCount`: Number of research reports (default: 2)
 *                                - `region`: Market region (default: "US")
 *                                - `lang`: Language for results (default: "en-US")
 * @param moduleOptions - Optional module configuration (validateResult, etc.)
 *
 * @returns Promise that resolves to an InsightsResult containing:
 *          - `recommendation`: Current analyst recommendation and target price
 *          - `sigDevs`: Array of significant developments and news
 *          - `reports`: Array of research reports with ratings and analysis
 *          - `companySnapshot`: Company performance scores vs sector/market
 *          - `events`: Upcoming events and earnings
 *
 * @throws Will throw an error if:
 *         - Network request fails
 *         - Invalid symbol
 *         - Validation fails (if enabled)
 *
 * @remarks
 * **Data Availability**: Insights data varies significantly by symbol.
 * Popular large-cap stocks typically have the most comprehensive coverage.
 *
 * **Premium Content**: Some research reports and detailed analysis may
 * require premium subscriptions or additional access rights.
 *
 * **Timeliness**: Recommendations and reports reflect the most recent
 * analyst coverage but may not include the very latest market developments.
 *
 * @see {@link InsightsOptions} for all available options
 * @see {@link InsightsResult} for complete result structure
 */
export default function insights(
  this: ModuleThis,
  symbol: string,
  queryOptionsOverrides?: InsightsOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  return this._moduleExec({
    moduleName: "insights",
    query: {
      assertSymbol: symbol,
      url: "https://${YF_QUERY_HOST}/ws/insights/v2/finance/insights",
      definitions,
      schemaKey: "#/definitions/InsightsOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
      runtime: { symbol },
    },
    result: {
      definitions,
      schemaKey: "#/definitions/InsightsResult",
      transformWith(result: Record<string, Record<string, unknown>>) {
        if (!result.finance) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }
        return result.finance.result;
      },
    },
    moduleOptions,
  });
}
