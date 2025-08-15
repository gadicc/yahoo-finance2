/**
 * Recommendations by Symbol module for finding related and similar stocks.
 *
 * This module provides stock recommendations based on algorithmic analysis of
 * price movements, sector similarity, and other financial metrics. Useful for
 * portfolio diversification and discovering related investment opportunities.
 *
 * @example Basic Usage - Single Symbol
 * ```typescript
 * import YahooFinance from "yahoo-finance2";
 * const yahooFinance = new YahooFinance();
 *
 * // Get recommendations for Apple
 * const recommendations = await yahooFinance.recommendationsBySymbol('AAPL');
 *
 * console.log(`Recommendations for ${recommendations.symbol}:`);
 * recommendations.recommendedSymbols.forEach((rec, index) => {
 *   console.log(`${index + 1}. ${rec.symbol} (Score: ${rec.score.toFixed(3)})`);
 * });
 * ```
 *
 * @example Multiple Symbols Analysis
 * ```typescript
 * // Get recommendations for multiple stocks
 * const symbols = ['TSLA', 'NVDA', 'AMD'];
 * const allRecommendations = await yahooFinance.recommendationsBySymbol(symbols);
 *
 * allRecommendations.forEach(result => {
 *   console.log(`\n${result.symbol} recommendations:`);
 *   result.recommendedSymbols.slice(0, 3).forEach(rec => {
 *     console.log(`  ${rec.symbol}: ${(rec.score * 100).toFixed(1)}% similarity`);
 *   });
 * });
 * ```
 *
 * @example Portfolio Expansion Ideas
 * ```typescript
 * // Find stocks similar to your portfolio holdings
 * const portfolio = ['AAPL', 'MSFT', 'GOOGL'];
 * const recommendations = await yahooFinance.recommendationsBySymbol(portfolio);
 *
 * // Collect all unique recommendations
 * const allRecs = new Map();
 *
 * recommendations.forEach(result => {
 *   result.recommendedSymbols.forEach(rec => {
 *     if (!portfolio.includes(rec.symbol)) {
 *       const existing = allRecs.get(rec.symbol) || { symbol: rec.symbol, totalScore: 0, count: 0 };
 *       existing.totalScore += rec.score;
 *       existing.count += 1;
 *       allRecs.set(rec.symbol, existing);
 *     }
 *   });
 * });
 *
 * // Sort by average score
 * const sortedRecs = Array.from(allRecs.values())
 *   .map(rec => ({ ...rec, avgScore: rec.totalScore / rec.count }))
 *   .sort((a, b) => b.avgScore - a.avgScore);
 *
 * console.log('Top portfolio expansion ideas:');
 * sortedRecs.slice(0, 5).forEach((rec, index) => {
 *   console.log(`${index + 1}. ${rec.symbol} (avg similarity: ${(rec.avgScore * 100).toFixed(1)}%)`);
 * });
 * ```
 *
 * @example Sector and Theme Analysis
 * ```typescript
 * // Analyze tech stock recommendations
 * const techStocks = ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'];
 * const techRecs = await yahooFinance.recommendationsBySymbol(techStocks);
 *
 * // Find most commonly recommended stocks
 * const recCounts = new Map();
 *
 * techRecs.forEach(result => {
 *   result.recommendedSymbols.forEach(rec => {
 *     if (!techStocks.includes(rec.symbol)) {
 *       recCounts.set(rec.symbol, (recCounts.get(rec.symbol) || 0) + 1);
 *     }
 *   });
 * });
 *
 * // Sort by frequency
 * const commonRecs = Array.from(recCounts.entries())
 *   .sort((a, b) => b[1] - a[1])
 *   .slice(0, 10);
 *
 * console.log('Most commonly recommended across big tech:');
 * commonRecs.forEach(([symbol, count], index) => {
 *   console.log(`${index + 1}. ${symbol} (recommended by ${count}/${techStocks.length} stocks)`);
 * });
 * ```
 *
 * @example High-Confidence Recommendations
 * ```typescript
 * const result = await yahooFinance.recommendationsBySymbol('NFLX');
 *
 * // Filter for high-confidence recommendations (score > 0.25)
 * const highConfidence = result.recommendedSymbols.filter(rec => rec.score > 0.25);
 *
 * if (highConfidence.length > 0) {
 *   console.log(`High-confidence recommendations for ${result.symbol}:`);
 *   highConfidence.forEach(rec => {
 *     console.log(`${rec.symbol}: ${(rec.score * 100).toFixed(1)}% confidence`);
 *   });
 * } else {
 *   console.log('No high-confidence recommendations found');
 * }
 *
 * // Get additional data for top recommendation
 * if (result.recommendedSymbols.length > 0) {
 *   const topRec = result.recommendedSymbols[0];
 *   const topRecQuote = await yahooFinance.quote(topRec.symbol);
 *   console.log(`\nTop recommendation ${topRec.symbol}:`);
 *   console.log(`Current price: $${topRecQuote.regularMarketPrice}`);
 *   console.log(`Market cap: $${topRecQuote.marketCap?.toLocaleString()}`);
 * }
 * ```
 *
 * @example International Market Recommendations
 * ```typescript
 * // Get recommendations for international stocks
 * const internationalStocks = ['ASML.AS', 'TSM', '7203.T']; // ASML, Taiwan Semi, Toyota
 * const intlRecs = await yahooFinance.recommendationsBySymbol(internationalStocks);
 *
 * intlRecs.forEach(result => {
 *   console.log(`\nRecommendations for ${result.symbol}:`);
 *
 *   // Separate domestic vs international recommendations
 *   const domestic = result.recommendedSymbols.filter(rec => !rec.symbol.includes('.'));
 *   const international = result.recommendedSymbols.filter(rec => rec.symbol.includes('.'));
 *
 *   if (domestic.length > 0) {
 *     console.log('  US stocks:', domestic.slice(0, 3).map(r => r.symbol).join(', '));
 *   }
 *   if (international.length > 0) {
 *     console.log('  Intl stocks:', international.slice(0, 3).map(r => r.symbol).join(', '));
 *   }
 * });
 * ```
 *
 * @example Comparative Analysis
 * ```typescript
 * // Compare recommendations between competing companies
 * const competitors = ['COCA', 'PEP']; // Coca-Cola vs Pepsi
 * const compRecs = await yahooFinance.recommendationsBySymbol(competitors);
 *
 * console.log('Competitive analysis:');
 * compRecs.forEach(result => {
 *   console.log(`\n${result.symbol} recommendations:`);
 *   result.recommendedSymbols.slice(0, 5).forEach((rec, index) => {
 *     const isCompetitor = competitors.includes(rec.symbol);
 *     const marker = isCompetitor ? '🔥' : '  ';
 *     console.log(`${marker}${index + 1}. ${rec.symbol} (${(rec.score * 100).toFixed(1)}%)`);
 *   });
 * });
 * ```
 *
 * @remarks
 * **Recommendation Scores**: Scores typically range from 0 to 1, with higher scores
 * indicating stronger algorithmic similarity. Scores above 0.25 generally indicate
 * meaningful relationships.
 *
 * **Algorithm Basis**: Recommendations are based on multiple factors including:
 * - Price movement correlation
 * - Sector and industry classification
 * - Market capitalization similarity
 * - Trading volume patterns
 * - Other proprietary metrics
 *
 * **Data Freshness**: Recommendations are updated periodically but may not reflect
 * the most recent market changes or news events.
 *
 * **Interpretation**: High scores don't necessarily mean good investment decisions.
 * Always conduct fundamental analysis before making investment choices.
 *
 * **Coverage**: Works best with large-cap, actively traded stocks. Recommendations
 * for small-cap or international stocks may be limited.
 *
 * @see {@link search} for finding stocks by name or description
 * @see {@link quote} for getting current prices of recommended stocks
 *
 * @module recommendationsBySymbol
 */

import type {
  ModuleOptions,
  ModuleOptionsWithValidateFalse,
  ModuleOptionsWithValidateTrue,
  ModuleThis,
} from "../lib/moduleCommon.ts";

import { getTypedDefinitions } from "../lib/validate/index.ts";

// @yf-schema: see the docs on how this file is automatically updated.
import schema from "./recommendationsBySymbol.schema.json" with {
  type: "json",
};
const definitions = getTypedDefinitions(schema);

export interface RecommendationsBySymbolResponse {
  [key: string]: unknown;
  recommendedSymbols: Array<{
    [key: string]: unknown;
    score: number; // 0.1927
    symbol: string; // "BMW.DE"
  }>;
  symbol: string;
}

export type RecommendationsBySymbolResponseArray =
  RecommendationsBySymbolResponse[];

export interface RecommendationsBySymbolOptions {
  [key: string]: never;
}

const queryOptionsDefaults = {};

export default function recommendationsBySymbol(
  this: ModuleThis,
  query: string,
  queryOptionsOverrides?: RecommendationsBySymbolOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<RecommendationsBySymbolResponse>;

export default function recommendationsBySymbol(
  this: ModuleThis,
  query: string | string[],
  queryOptionsOverrides?: RecommendationsBySymbolOptions,
  moduleOptions?: ModuleOptionsWithValidateTrue,
): Promise<RecommendationsBySymbolResponseArray>;

export default function recommendationsBySymbol(
  this: ModuleThis,
  query: string | string[],
  queryOptionsOverrides?: RecommendationsBySymbolOptions,
  moduleOptions?: ModuleOptionsWithValidateFalse,
): Promise<unknown>;

export default function recommendationsBySymbol(
  this: ModuleThis,
  query: string | string[],
  queryOptionsOverrides?: RecommendationsBySymbolOptions,
  moduleOptions?: ModuleOptions,
): Promise<unknown> {
  const symbols = typeof query === "string" ? query : query.join(",");

  return this._moduleExec({
    moduleName: "recommendationsBySymbol",

    query: {
      url: "https://${YF_QUERY_HOST}/v6/finance/recommendationsbysymbol/" +
        symbols,
      definitions,
      schemaKey: "#/definitions/RecommendationsBySymbolOptions",
      defaults: queryOptionsDefaults,
      overrides: queryOptionsOverrides,
    },

    result: {
      definitions,
      schemaKey: "#/definitions/RecommendationsBySymbolResponseArray",
      // deno-lint-ignore no-explicit-any
      transformWith(result: any) {
        if (!result.finance) {
          throw new Error("Unexpected result: " + JSON.stringify(result));
        }
        return result.finance.result;
      },
    },

    moduleOptions,
  }).then((results: RecommendationsBySymbolResponseArray) => {
    return typeof query === "string"
      ? (results[0] as RecommendationsBySymbolResponse)
      : (results as RecommendationsBySymbolResponseArray);
  });
}
