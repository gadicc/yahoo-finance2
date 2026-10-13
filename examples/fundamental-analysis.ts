#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Fundamental Analysis App
 *
 * A comprehensive stock fundamental analysis tool that evaluates:
 * - Valuation metrics (P/E, P/B, EV/EBITDA, PEG)
 * - Profitability metrics (margins, ROE, ROA)
 * - Financial health (debt ratios, liquidity)
 * - Growth metrics (revenue, earnings growth)
 * - Analyst recommendations
 * - Insider activity
 *
 * Usage:
 *   deno run --allow-net --allow-env examples/fundamental-analysis.ts AAPL
 *   node examples/fundamental-analysis.ts MSFT
 */

import yahooFinance from "../src/index.ts";

interface AnalysisMetrics {
  // Valuation
  priceToEarnings?: number;
  priceToBook?: number;
  priceToSales?: number;
  evToEbitda?: number;
  pegRatio?: number;

  // Profitability
  profitMargin?: number;
  operatingMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;

  // Financial Health
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;

  // Growth
  revenueGrowth?: number;
  earningsGrowth?: number;

  // Market
  marketCap?: number;
  beta?: number;
  dividendYield?: number;
}

interface AnalysisResult {
  symbol: string;
  companyName: string;
  sector?: string;
  industry?: string;
  currentPrice?: number;
  metrics: AnalysisMetrics;
  recommendations?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    consensus?: string;
  };
  insiderActivity?: {
    purchases: number;
    sales: number;
    netActivity?: string;
  };
  fundamentalScore: number;
  analysis: string[];
  warnings: string[];
}

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function formatNumber(num: number | undefined, decimals = 2): string {
  if (num === undefined || num === null) return 'N/A';
  return num.toFixed(decimals);
}

function formatLargeNumber(num: number | undefined): string {
  if (num === undefined || num === null) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toFixed(2)}`;
}

function formatPercentage(num: number | undefined): string {
  if (num === undefined || num === null) return 'N/A';
  return `${(num * 100).toFixed(2)}%`;
}

function getValuationScore(metrics: AnalysisMetrics): number {
  let score = 0;
  let count = 0;

  // P/E ratio (lower is better, typical range 10-25)
  if (metrics.priceToEarnings !== undefined) {
    if (metrics.priceToEarnings < 0) score += 0; // Negative earnings
    else if (metrics.priceToEarnings < 15) score += 10;
    else if (metrics.priceToEarnings < 25) score += 7;
    else if (metrics.priceToEarnings < 35) score += 4;
    else score += 2;
    count++;
  }

  // P/B ratio (lower is better, typical range 1-3)
  if (metrics.priceToBook !== undefined) {
    if (metrics.priceToBook < 1) score += 10;
    else if (metrics.priceToBook < 3) score += 7;
    else if (metrics.priceToBook < 5) score += 4;
    else score += 2;
    count++;
  }

  // PEG ratio (lower is better, <1 is undervalued)
  if (metrics.pegRatio !== undefined && metrics.pegRatio > 0) {
    if (metrics.pegRatio < 1) score += 10;
    else if (metrics.pegRatio < 2) score += 7;
    else if (metrics.pegRatio < 3) score += 4;
    else score += 2;
    count++;
  }

  return count > 0 ? score / count : 5;
}

function getProfitabilityScore(metrics: AnalysisMetrics): number {
  let score = 0;
  let count = 0;

  // Profit margin (higher is better)
  if (metrics.profitMargin !== undefined) {
    if (metrics.profitMargin > 0.20) score += 10;
    else if (metrics.profitMargin > 0.10) score += 7;
    else if (metrics.profitMargin > 0.05) score += 4;
    else if (metrics.profitMargin > 0) score += 2;
    else score += 0;
    count++;
  }

  // ROE (higher is better)
  if (metrics.returnOnEquity !== undefined) {
    if (metrics.returnOnEquity > 0.20) score += 10;
    else if (metrics.returnOnEquity > 0.15) score += 7;
    else if (metrics.returnOnEquity > 0.10) score += 4;
    else if (metrics.returnOnEquity > 0) score += 2;
    else score += 0;
    count++;
  }

  return count > 0 ? score / count : 5;
}

function getFinancialHealthScore(metrics: AnalysisMetrics): number {
  let score = 0;
  let count = 0;

  // Debt to equity (lower is better)
  if (metrics.debtToEquity !== undefined) {
    if (metrics.debtToEquity < 0.5) score += 10;
    else if (metrics.debtToEquity < 1.0) score += 7;
    else if (metrics.debtToEquity < 2.0) score += 4;
    else score += 2;
    count++;
  }

  // Current ratio (higher is better, >1 means can cover liabilities)
  if (metrics.currentRatio !== undefined) {
    if (metrics.currentRatio > 2.0) score += 10;
    else if (metrics.currentRatio > 1.5) score += 7;
    else if (metrics.currentRatio > 1.0) score += 4;
    else score += 2;
    count++;
  }

  return count > 0 ? score / count : 5;
}

function getGrowthScore(metrics: AnalysisMetrics): number {
  let score = 0;
  let count = 0;

  // Revenue growth (higher is better)
  if (metrics.revenueGrowth !== undefined) {
    if (metrics.revenueGrowth > 0.20) score += 10;
    else if (metrics.revenueGrowth > 0.10) score += 7;
    else if (metrics.revenueGrowth > 0.05) score += 4;
    else if (metrics.revenueGrowth > 0) score += 2;
    else score += 0;
    count++;
  }

  // Earnings growth (higher is better)
  if (metrics.earningsGrowth !== undefined) {
    if (metrics.earningsGrowth > 0.20) score += 10;
    else if (metrics.earningsGrowth > 0.10) score += 7;
    else if (metrics.earningsGrowth > 0.05) score += 4;
    else if (metrics.earningsGrowth > 0) score += 2;
    else score += 0;
    count++;
  }

  return count > 0 ? score / count : 5;
}

function generateAnalysis(result: AnalysisResult): void {
  const m = result.metrics;

  // Valuation analysis
  if (m.priceToEarnings !== undefined) {
    if (m.priceToEarnings < 0) {
      result.warnings.push('Company is not currently profitable (negative P/E)');
    } else if (m.priceToEarnings < 15) {
      result.analysis.push('P/E ratio suggests potentially undervalued stock');
    } else if (m.priceToEarnings > 30) {
      result.warnings.push('High P/E ratio may indicate overvaluation or high growth expectations');
    }
  }

  if (m.pegRatio !== undefined && m.pegRatio > 0 && m.pegRatio < 1) {
    result.analysis.push('PEG ratio < 1 suggests stock may be undervalued relative to growth');
  }

  // Profitability analysis
  if (m.profitMargin !== undefined) {
    if (m.profitMargin > 0.15) {
      result.analysis.push('Strong profit margins indicate efficient operations');
    } else if (m.profitMargin < 0) {
      result.warnings.push('Negative profit margins - company is losing money');
    }
  }

  if (m.returnOnEquity !== undefined && m.returnOnEquity > 0.15) {
    result.analysis.push('High ROE shows effective use of shareholder equity');
  }

  // Financial health analysis
  if (m.debtToEquity !== undefined) {
    if (m.debtToEquity > 2.0) {
      result.warnings.push('High debt-to-equity ratio indicates significant leverage risk');
    } else if (m.debtToEquity < 0.5) {
      result.analysis.push('Low debt levels indicate strong financial stability');
    }
  }

  if (m.currentRatio !== undefined) {
    if (m.currentRatio < 1.0) {
      result.warnings.push('Current ratio < 1 suggests potential liquidity issues');
    } else if (m.currentRatio > 2.0) {
      result.analysis.push('Strong current ratio indicates good short-term financial health');
    }
  }

  // Growth analysis
  if (m.revenueGrowth !== undefined && m.revenueGrowth > 0.15) {
    result.analysis.push('Strong revenue growth indicates expanding business');
  }

  // Dividend analysis
  if (m.dividendYield !== undefined && m.dividendYield > 0.03) {
    result.analysis.push(`Attractive dividend yield of ${formatPercentage(m.dividendYield)}`);
  }
}

function calculateFundamentalScore(result: AnalysisResult): number {
  const valuationScore = getValuationScore(result.metrics);
  const profitabilityScore = getProfitabilityScore(result.metrics);
  const healthScore = getFinancialHealthScore(result.metrics);
  const growthScore = getGrowthScore(result.metrics);

  // Weighted average
  const totalScore = (
    valuationScore * 0.25 +
    profitabilityScore * 0.30 +
    healthScore * 0.25 +
    growthScore * 0.20
  );

  return totalScore;
}

async function analyzeFundamentals(symbol: string): Promise<AnalysisResult> {
  console.log(`${colors.cyan}Fetching fundamental data for ${symbol}...${colors.reset}\n`);

  // Fetch comprehensive fundamental data
  const quoteSummary = await yahooFinance.quoteSummary(symbol, {
    modules: [
      'price',
      'summaryDetail',
      'financialData',
      'defaultKeyStatistics',
      'assetProfile',
      'recommendationTrend',
      'insiderHolders',
      'insiderTransactions'
    ]
  });

  const price = quoteSummary.price;
  const detail = quoteSummary.summaryDetail;
  const financial = quoteSummary.financialData;
  const stats = quoteSummary.defaultKeyStatistics;
  const profile = quoteSummary.assetProfile;
  const recommendations = quoteSummary.recommendationTrend;
  const insiders = quoteSummary.insiderTransactions;

  // Build metrics object
  const metrics: AnalysisMetrics = {
    // Valuation
    priceToEarnings: detail?.trailingPE,
    priceToBook: stats?.priceToBook,
    priceToSales: stats?.priceToSalesTrailing12Months,
    evToEbitda: stats?.enterpriseToEbitda,
    pegRatio: stats?.pegRatio,

    // Profitability
    profitMargin: financial?.profitMargins,
    operatingMargin: financial?.operatingMargins,
    returnOnEquity: financial?.returnOnEquity,
    returnOnAssets: financial?.returnOnAssets,

    // Financial Health
    debtToEquity: financial?.debtToEquity,
    currentRatio: financial?.currentRatio,
    quickRatio: financial?.quickRatio,

    // Growth
    revenueGrowth: financial?.revenueGrowth,
    earningsGrowth: financial?.earningsGrowth,

    // Market
    marketCap: price?.marketCap,
    beta: stats?.beta,
    dividendYield: detail?.dividendYield,
  };

  // Analyst recommendations
  let recommendationData;
  if (recommendations?.trend && recommendations.trend.length > 0) {
    const latest = recommendations.trend[0];
    const total = (latest.strongBuy || 0) + (latest.buy || 0) +
                  (latest.hold || 0) + (latest.sell || 0) + (latest.strongSell || 0);

    let consensus = 'HOLD';
    const buyRatio = ((latest.strongBuy || 0) + (latest.buy || 0)) / total;
    const sellRatio = ((latest.strongSell || 0) + (latest.sell || 0)) / total;

    if (buyRatio > 0.6) consensus = 'STRONG BUY';
    else if (buyRatio > 0.4) consensus = 'BUY';
    else if (sellRatio > 0.4) consensus = 'SELL';

    recommendationData = {
      strongBuy: latest.strongBuy || 0,
      buy: latest.buy || 0,
      hold: latest.hold || 0,
      sell: latest.sell || 0,
      strongSell: latest.strongSell || 0,
      consensus
    };
  }

  // Insider activity
  let insiderActivity;
  if (insiders?.transactions && insiders.transactions.length > 0) {
    let purchases = 0;
    let sales = 0;

    insiders.transactions.forEach(txn => {
      if (txn.transactionText?.toLowerCase().includes('buy') ||
          txn.transactionText?.toLowerCase().includes('purchase')) {
        purchases++;
      } else if (txn.transactionText?.toLowerCase().includes('sale') ||
                 txn.transactionText?.toLowerCase().includes('sell')) {
        sales++;
      }
    });

    let netActivity = 'NEUTRAL';
    if (purchases > sales * 1.5) netActivity = 'BUYING';
    else if (sales > purchases * 1.5) netActivity = 'SELLING';

    insiderActivity = { purchases, sales, netActivity };
  }

  const result: AnalysisResult = {
    symbol: symbol.toUpperCase(),
    companyName: price?.longName || price?.shortName || symbol,
    sector: profile?.sector,
    industry: profile?.industry,
    currentPrice: price?.regularMarketPrice,
    metrics,
    recommendations: recommendationData,
    insiderActivity,
    fundamentalScore: 0,
    analysis: [],
    warnings: []
  };

  generateAnalysis(result);
  result.fundamentalScore = calculateFundamentalScore(result);

  return result;
}

function printAnalysisReport(result: AnalysisResult): void {
  const m = result.metrics;

  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  FUNDAMENTAL ANALYSIS REPORT${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}\n`);

  // Company Overview
  console.log(`${colors.bright}Company:${colors.reset} ${result.companyName} (${result.symbol})`);
  if (result.sector) console.log(`${colors.bright}Sector:${colors.reset} ${result.sector}`);
  if (result.industry) console.log(`${colors.bright}Industry:${colors.reset} ${result.industry}`);
  if (result.currentPrice) console.log(`${colors.bright}Current Price:${colors.reset} $${result.currentPrice.toFixed(2)}`);
  if (m.marketCap) console.log(`${colors.bright}Market Cap:${colors.reset} ${formatLargeNumber(m.marketCap)}`);
  console.log();

  // Overall Score
  let scoreColor = colors.red;
  let scoreRating = 'POOR';
  if (result.fundamentalScore >= 8) {
    scoreColor = colors.green;
    scoreRating = 'EXCELLENT';
  } else if (result.fundamentalScore >= 6.5) {
    scoreColor = colors.green;
    scoreRating = 'GOOD';
  } else if (result.fundamentalScore >= 5) {
    scoreColor = colors.yellow;
    scoreRating = 'AVERAGE';
  } else if (result.fundamentalScore >= 3.5) {
    scoreColor = colors.yellow;
    scoreRating = 'BELOW AVERAGE';
  }

  console.log(`${colors.bright}${scoreColor}Fundamental Score: ${result.fundamentalScore.toFixed(1)}/10 (${scoreRating})${colors.reset}\n`);

  // Valuation Metrics
  console.log(`${colors.bright}${colors.magenta}VALUATION METRICS${colors.reset}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`P/E Ratio (Trailing):     ${formatNumber(m.priceToEarnings)}`);
  console.log(`Price to Book:            ${formatNumber(m.priceToBook)}`);
  console.log(`Price to Sales:           ${formatNumber(m.priceToSales)}`);
  console.log(`EV/EBITDA:                ${formatNumber(m.evToEbitda)}`);
  console.log(`PEG Ratio:                ${formatNumber(m.pegRatio)}`);
  console.log();

  // Profitability Metrics
  console.log(`${colors.bright}${colors.magenta}PROFITABILITY METRICS${colors.reset}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Profit Margin:            ${formatPercentage(m.profitMargin)}`);
  console.log(`Operating Margin:         ${formatPercentage(m.operatingMargin)}`);
  console.log(`Return on Equity (ROE):   ${formatPercentage(m.returnOnEquity)}`);
  console.log(`Return on Assets (ROA):   ${formatPercentage(m.returnOnAssets)}`);
  console.log();

  // Financial Health Metrics
  console.log(`${colors.bright}${colors.magenta}FINANCIAL HEALTH${colors.reset}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Debt to Equity:           ${formatNumber(m.debtToEquity)}`);
  console.log(`Current Ratio:            ${formatNumber(m.currentRatio)}`);
  console.log(`Quick Ratio:              ${formatNumber(m.quickRatio)}`);
  console.log();

  // Growth Metrics
  console.log(`${colors.bright}${colors.magenta}GROWTH METRICS${colors.reset}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Revenue Growth:           ${formatPercentage(m.revenueGrowth)}`);
  console.log(`Earnings Growth:          ${formatPercentage(m.earningsGrowth)}`);
  console.log();

  // Market Metrics
  console.log(`${colors.bright}${colors.magenta}MARKET METRICS${colors.reset}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Beta:                     ${formatNumber(m.beta)}`);
  console.log(`Dividend Yield:           ${formatPercentage(m.dividendYield)}`);
  console.log();

  // Analyst Recommendations
  if (result.recommendations) {
    console.log(`${colors.bright}${colors.magenta}ANALYST RECOMMENDATIONS${colors.reset}`);
    console.log(`${'─'.repeat(80)}`);
    const r = result.recommendations;
    console.log(`Strong Buy:               ${r.strongBuy}`);
    console.log(`Buy:                      ${r.buy}`);
    console.log(`Hold:                     ${r.hold}`);
    console.log(`Sell:                     ${r.sell}`);
    console.log(`Strong Sell:              ${r.strongSell}`);

    let consensusColor = colors.yellow;
    if (r.consensus === 'STRONG BUY' || r.consensus === 'BUY') consensusColor = colors.green;
    else if (r.consensus === 'SELL') consensusColor = colors.red;

    console.log(`${colors.bright}Consensus:${colors.reset}                ${consensusColor}${r.consensus}${colors.reset}`);
    console.log();
  }

  // Insider Activity
  if (result.insiderActivity) {
    console.log(`${colors.bright}${colors.magenta}INSIDER ACTIVITY (Recent)${colors.reset}`);
    console.log(`${'─'.repeat(80)}`);
    const ia = result.insiderActivity;
    console.log(`Purchases:                ${ia.purchases}`);
    console.log(`Sales:                    ${ia.sales}`);

    let activityColor = colors.yellow;
    if (ia.netActivity === 'BUYING') activityColor = colors.green;
    else if (ia.netActivity === 'SELLING') activityColor = colors.red;

    console.log(`${colors.bright}Net Activity:${colors.reset}             ${activityColor}${ia.netActivity}${colors.reset}`);
    console.log();
  }

  // Key Insights
  if (result.analysis.length > 0) {
    console.log(`${colors.bright}${colors.green}KEY INSIGHTS${colors.reset}`);
    console.log(`${'─'.repeat(80)}`);
    result.analysis.forEach(insight => {
      console.log(`${colors.green}✓${colors.reset} ${insight}`);
    });
    console.log();
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(`${colors.bright}${colors.yellow}WARNINGS${colors.reset}`);
    console.log(`${'─'.repeat(80)}`);
    result.warnings.forEach(warning => {
      console.log(`${colors.yellow}⚠${colors.reset} ${warning}`);
    });
    console.log();
  }

  console.log(`${colors.bright}${colors.blue}${'='.repeat(80)}${colors.reset}\n`);

  // Investment Interpretation
  console.log(`${colors.bright}INTERPRETATION:${colors.reset}`);
  if (result.fundamentalScore >= 7.5) {
    console.log(`${colors.green}This stock shows strong fundamentals across multiple metrics. It may be`);
    console.log(`a solid investment candidate, but always consider your risk tolerance and`);
    console.log(`investment goals. Conduct additional research before investing.${colors.reset}`);
  } else if (result.fundamentalScore >= 6) {
    console.log(`${colors.green}This stock demonstrates above-average fundamentals. Review the warnings`);
    console.log(`and consider how they align with your investment strategy.${colors.reset}`);
  } else if (result.fundamentalScore >= 4.5) {
    console.log(`${colors.yellow}This stock has mixed fundamentals. Carefully review both the insights and`);
    console.log(`warnings. Consider whether the potential rewards justify the risks.${colors.reset}`);
  } else {
    console.log(`${colors.red}This stock shows concerning fundamentals. Review the warnings carefully.`);
    console.log(`Higher risk investments may not be suitable for all investors.${colors.reset}`);
  }

  console.log(`\n${colors.cyan}Disclaimer: This is for informational purposes only and should not be`);
  console.log(`considered investment advice. Always do your own research and consult with`);
  console.log(`a financial advisor before making investment decisions.${colors.reset}\n`);
}

// Main execution
async function main() {
  const args = Deno?.args || process.argv.slice(2);

  if (args.length === 0) {
    console.log(`${colors.red}Error: Please provide a stock symbol${colors.reset}`);
    console.log(`\nUsage: deno run --allow-net --allow-env examples/fundamental-analysis.ts SYMBOL`);
    console.log(`Example: deno run --allow-net --allow-env examples/fundamental-analysis.ts AAPL\n`);
    Deno?.exit(1) || process.exit(1);
  }

  const symbol = args[0].toUpperCase();

  try {
    const result = await analyzeFundamentals(symbol);
    printAnalysisReport(result);
  } catch (error) {
    console.error(`${colors.red}Error analyzing ${symbol}:${colors.reset}`, error.message);
    if (error.message.includes('No data found')) {
      console.log(`\n${colors.yellow}Tip: Make sure you're using a valid stock symbol (e.g., AAPL, MSFT, GOOGL)${colors.reset}\n`);
    }
    Deno?.exit(1) || process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

export { analyzeFundamentals, type AnalysisResult };
