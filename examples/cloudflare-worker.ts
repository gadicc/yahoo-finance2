/**
 * Cloudflare Workers API for Fundamental Analysis
 *
 * Deploys the fundamental analysis app as a serverless API on Cloudflare Workers.
 *
 * API Endpoints:
 * - GET /api/analyze/{symbol} - Get fundamental analysis for a stock
 * - GET /api/analyze/{symbol}?format=json - Get JSON response
 * - GET / - API documentation
 *
 * Deploy: wrangler deploy examples/cloudflare-worker.ts
 */

import yahooFinance from "../src/index.ts";

interface AnalysisMetrics {
  priceToEarnings?: number;
  priceToBook?: number;
  priceToSales?: number;
  evToEbitda?: number;
  pegRatio?: number;
  profitMargin?: number;
  operatingMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
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
  scoreRating: string;
  analysis: string[];
  warnings: string[];
  timestamp: string;
}

function getValuationScore(metrics: AnalysisMetrics): number {
  let score = 0;
  let count = 0;

  if (metrics.priceToEarnings !== undefined) {
    if (metrics.priceToEarnings < 0) score += 0;
    else if (metrics.priceToEarnings < 15) score += 10;
    else if (metrics.priceToEarnings < 25) score += 7;
    else if (metrics.priceToEarnings < 35) score += 4;
    else score += 2;
    count++;
  }

  if (metrics.priceToBook !== undefined) {
    if (metrics.priceToBook < 1) score += 10;
    else if (metrics.priceToBook < 3) score += 7;
    else if (metrics.priceToBook < 5) score += 4;
    else score += 2;
    count++;
  }

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

  if (metrics.profitMargin !== undefined) {
    if (metrics.profitMargin > 0.20) score += 10;
    else if (metrics.profitMargin > 0.10) score += 7;
    else if (metrics.profitMargin > 0.05) score += 4;
    else if (metrics.profitMargin > 0) score += 2;
    else score += 0;
    count++;
  }

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

  if (metrics.debtToEquity !== undefined) {
    if (metrics.debtToEquity < 0.5) score += 10;
    else if (metrics.debtToEquity < 1.0) score += 7;
    else if (metrics.debtToEquity < 2.0) score += 4;
    else score += 2;
    count++;
  }

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

  if (metrics.revenueGrowth !== undefined) {
    if (metrics.revenueGrowth > 0.20) score += 10;
    else if (metrics.revenueGrowth > 0.10) score += 7;
    else if (metrics.revenueGrowth > 0.05) score += 4;
    else if (metrics.revenueGrowth > 0) score += 2;
    else score += 0;
    count++;
  }

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

function calculateFundamentalScore(metrics: AnalysisMetrics): number {
  const valuationScore = getValuationScore(metrics);
  const profitabilityScore = getProfitabilityScore(metrics);
  const healthScore = getFinancialHealthScore(metrics);
  const growthScore = getGrowthScore(metrics);

  return (
    valuationScore * 0.25 +
    profitabilityScore * 0.30 +
    healthScore * 0.25 +
    growthScore * 0.20
  );
}

function generateAnalysis(result: AnalysisResult): void {
  const m = result.metrics;

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

  if (m.revenueGrowth !== undefined && m.revenueGrowth > 0.15) {
    result.analysis.push('Strong revenue growth indicates expanding business');
  }

  if (m.dividendYield !== undefined && m.dividendYield > 0.03) {
    result.analysis.push(`Attractive dividend yield of ${(m.dividendYield * 100).toFixed(2)}%`);
  }
}

function getScoreRating(score: number): string {
  if (score >= 8) return 'EXCELLENT';
  if (score >= 6.5) return 'GOOD';
  if (score >= 5) return 'AVERAGE';
  if (score >= 3.5) return 'BELOW AVERAGE';
  return 'POOR';
}

async function analyzeFundamentals(symbol: string): Promise<AnalysisResult> {
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

  const metrics: AnalysisMetrics = {
    priceToEarnings: detail?.trailingPE,
    priceToBook: stats?.priceToBook,
    priceToSales: stats?.priceToSalesTrailing12Months,
    evToEbitda: stats?.enterpriseToEbitda,
    pegRatio: stats?.pegRatio,
    profitMargin: financial?.profitMargins,
    operatingMargin: financial?.operatingMargins,
    returnOnEquity: financial?.returnOnEquity,
    returnOnAssets: financial?.returnOnAssets,
    debtToEquity: financial?.debtToEquity,
    currentRatio: financial?.currentRatio,
    quickRatio: financial?.quickRatio,
    revenueGrowth: financial?.revenueGrowth,
    earningsGrowth: financial?.earningsGrowth,
    marketCap: price?.marketCap,
    beta: stats?.beta,
    dividendYield: detail?.dividendYield,
  };

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
    scoreRating: '',
    analysis: [],
    warnings: [],
    timestamp: new Date().toISOString()
  };

  generateAnalysis(result);
  result.fundamentalScore = calculateFundamentalScore(result);
  result.scoreRating = getScoreRating(result.fundamentalScore);

  return result;
}

function generateHTMLReport(result: AnalysisResult): string {
  const formatNumber = (num?: number, decimals = 2) =>
    num !== undefined && num !== null ? num.toFixed(decimals) : 'N/A';

  const formatPercentage = (num?: number) =>
    num !== undefined && num !== null ? `${(num * 100).toFixed(2)}%` : 'N/A';

  const formatLargeNumber = (num?: number) => {
    if (num === undefined || num === null) return 'N/A';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toFixed(2)}`;
  };

  const scoreColor = result.fundamentalScore >= 7.5 ? '#22c55e' :
                     result.fundamentalScore >= 6 ? '#86efac' :
                     result.fundamentalScore >= 4.5 ? '#fbbf24' : '#ef4444';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fundamental Analysis: ${result.symbol}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      color: #1f2937;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }
    h1 { color: #667eea; font-size: 36px; margin-bottom: 8px; }
    h2 { color: #764ba2; font-size: 24px; margin: 24px 0 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    .header { text-align: center; }
    .score-badge {
      display: inline-block;
      background: ${scoreColor};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 24px;
      font-weight: bold;
      margin: 16px 0;
    }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 16px 0; }
    .info-item { background: #f9fafb; padding: 16px; border-radius: 8px; }
    .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
    .info-value { font-size: 20px; font-weight: bold; color: #1f2937; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
    .metric { display: flex; justify-content: space-between; padding: 12px; background: #f9fafb; border-radius: 6px; }
    .metric-label { color: #6b7280; }
    .metric-value { font-weight: 600; }
    .insights { list-style: none; }
    .insights li { padding: 12px; margin: 8px 0; border-radius: 6px; }
    .insight { background: #d1fae5; border-left: 4px solid #10b981; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
    .recommendations { display: flex; gap: 12px; flex-wrap: wrap; }
    .rec-badge {
      padding: 8px 16px;
      border-radius: 6px;
      background: #f3f4f6;
      font-weight: 500;
    }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 32px; }
    .api-link {
      display: inline-block;
      margin-top: 16px;
      padding: 8px 16px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
    }
    .api-link:hover { background: #5568d3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card header">
      <h1>📊 Fundamental Analysis Report</h1>
      <h2>${result.companyName} (${result.symbol})</h2>
      <div class="score-badge">${result.fundamentalScore.toFixed(1)}/10 - ${result.scoreRating}</div>
      <div class="info-grid">
        ${result.sector ? `<div class="info-item"><div class="info-label">Sector</div><div class="info-value">${result.sector}</div></div>` : ''}
        ${result.industry ? `<div class="info-item"><div class="info-label">Industry</div><div class="info-value">${result.industry}</div></div>` : ''}
        ${result.currentPrice ? `<div class="info-item"><div class="info-label">Current Price</div><div class="info-value">$${result.currentPrice.toFixed(2)}</div></div>` : ''}
        ${result.metrics.marketCap ? `<div class="info-item"><div class="info-label">Market Cap</div><div class="info-value">${formatLargeNumber(result.metrics.marketCap)}</div></div>` : ''}
      </div>
      <a href="?format=json" class="api-link">View JSON Response</a>
    </div>

    <div class="card">
      <h2>💰 Valuation Metrics</h2>
      <div class="metrics-grid">
        <div class="metric"><span class="metric-label">P/E Ratio</span><span class="metric-value">${formatNumber(result.metrics.priceToEarnings)}</span></div>
        <div class="metric"><span class="metric-label">Price to Book</span><span class="metric-value">${formatNumber(result.metrics.priceToBook)}</span></div>
        <div class="metric"><span class="metric-label">Price to Sales</span><span class="metric-value">${formatNumber(result.metrics.priceToSales)}</span></div>
        <div class="metric"><span class="metric-label">EV/EBITDA</span><span class="metric-value">${formatNumber(result.metrics.evToEbitda)}</span></div>
        <div class="metric"><span class="metric-label">PEG Ratio</span><span class="metric-value">${formatNumber(result.metrics.pegRatio)}</span></div>
      </div>
    </div>

    <div class="card">
      <h2>📈 Profitability Metrics</h2>
      <div class="metrics-grid">
        <div class="metric"><span class="metric-label">Profit Margin</span><span class="metric-value">${formatPercentage(result.metrics.profitMargin)}</span></div>
        <div class="metric"><span class="metric-label">Operating Margin</span><span class="metric-value">${formatPercentage(result.metrics.operatingMargin)}</span></div>
        <div class="metric"><span class="metric-label">Return on Equity</span><span class="metric-value">${formatPercentage(result.metrics.returnOnEquity)}</span></div>
        <div class="metric"><span class="metric-label">Return on Assets</span><span class="metric-value">${formatPercentage(result.metrics.returnOnAssets)}</span></div>
      </div>
    </div>

    <div class="card">
      <h2>🏦 Financial Health</h2>
      <div class="metrics-grid">
        <div class="metric"><span class="metric-label">Debt to Equity</span><span class="metric-value">${formatNumber(result.metrics.debtToEquity)}</span></div>
        <div class="metric"><span class="metric-label">Current Ratio</span><span class="metric-value">${formatNumber(result.metrics.currentRatio)}</span></div>
        <div class="metric"><span class="metric-label">Quick Ratio</span><span class="metric-value">${formatNumber(result.metrics.quickRatio)}</span></div>
      </div>
    </div>

    <div class="card">
      <h2>🚀 Growth Metrics</h2>
      <div class="metrics-grid">
        <div class="metric"><span class="metric-label">Revenue Growth</span><span class="metric-value">${formatPercentage(result.metrics.revenueGrowth)}</span></div>
        <div class="metric"><span class="metric-label">Earnings Growth</span><span class="metric-value">${formatPercentage(result.metrics.earningsGrowth)}</span></div>
      </div>
    </div>

    ${result.recommendations ? `
    <div class="card">
      <h2>👥 Analyst Recommendations</h2>
      <div class="recommendations">
        <div class="rec-badge">Strong Buy: ${result.recommendations.strongBuy}</div>
        <div class="rec-badge">Buy: ${result.recommendations.buy}</div>
        <div class="rec-badge">Hold: ${result.recommendations.hold}</div>
        <div class="rec-badge">Sell: ${result.recommendations.sell}</div>
        <div class="rec-badge">Strong Sell: ${result.recommendations.strongSell}</div>
      </div>
      <p style="margin-top: 16px; font-size: 18px;"><strong>Consensus:</strong> ${result.recommendations.consensus}</p>
    </div>
    ` : ''}

    ${result.insiderActivity ? `
    <div class="card">
      <h2>👔 Insider Activity</h2>
      <div class="metrics-grid">
        <div class="metric"><span class="metric-label">Recent Purchases</span><span class="metric-value">${result.insiderActivity.purchases}</span></div>
        <div class="metric"><span class="metric-label">Recent Sales</span><span class="metric-value">${result.insiderActivity.sales}</span></div>
        <div class="metric"><span class="metric-label">Net Activity</span><span class="metric-value">${result.insiderActivity.netActivity}</span></div>
      </div>
    </div>
    ` : ''}

    ${result.analysis.length > 0 ? `
    <div class="card">
      <h2>✨ Key Insights</h2>
      <ul class="insights">
        ${result.analysis.map(insight => `<li class="insight">✓ ${insight}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${result.warnings.length > 0 ? `
    <div class="card">
      <h2>⚠️ Warnings</h2>
      <ul class="insights">
        ${result.warnings.map(warning => `<li class="warning">⚠ ${warning}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <div class="footer">
      <p><strong>Disclaimer:</strong> This analysis is for informational purposes only and does not constitute investment advice.</p>
      <p style="margin-top: 8px;">Generated at ${new Date(result.timestamp).toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateDocsHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stock Fundamental Analysis API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      color: #1f2937;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }
    h1 { color: #667eea; font-size: 36px; margin-bottom: 16px; }
    h2 { color: #764ba2; font-size: 24px; margin: 24px 0 16px; }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
    }
    pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 16px 0;
    }
    .endpoint {
      background: #ede9fe;
      padding: 12px;
      border-radius: 6px;
      margin: 12px 0;
      border-left: 4px solid #7c3aed;
    }
    .try-btn {
      display: inline-block;
      margin-top: 8px;
      padding: 8px 16px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
    }
    .try-btn:hover { background: #5568d3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>📊 Stock Fundamental Analysis API</h1>
      <p style="font-size: 18px; color: #6b7280; margin-top: 8px;">
        A serverless API for comprehensive stock fundamental analysis powered by Yahoo Finance.
      </p>
    </div>

    <div class="card">
      <h2>🚀 Quick Start</h2>
      <p>Analyze any stock by making a request to:</p>

      <div class="endpoint">
        <strong>GET</strong> <code>/api/analyze/{symbol}</code>
        <a href="/api/analyze/AAPL" class="try-btn">Try with AAPL</a>
      </div>

      <p style="margin-top: 16px;">For JSON response, add the format parameter:</p>

      <div class="endpoint">
        <strong>GET</strong> <code>/api/analyze/{symbol}?format=json</code>
        <a href="/api/analyze/AAPL?format=json" class="try-btn">Try JSON</a>
      </div>
    </div>

    <div class="card">
      <h2>📖 Examples</h2>

      <h3 style="margin-top: 20px;">HTML Report (Default)</h3>
      <pre>curl https://your-worker.workers.dev/api/analyze/MSFT</pre>

      <h3 style="margin-top: 20px;">JSON Response</h3>
      <pre>curl https://your-worker.workers.dev/api/analyze/GOOGL?format=json</pre>

      <h3 style="margin-top: 20px;">JavaScript/TypeScript</h3>
      <pre>const response = await fetch('/api/analyze/TSLA?format=json');
const analysis = await response.json();
console.log(analysis.fundamentalScore); // 7.5</pre>
    </div>

    <div class="card">
      <h2>📊 Analysis Includes</h2>
      <ul style="list-style-position: inside; line-height: 1.8;">
        <li><strong>Valuation:</strong> P/E, P/B, P/S, EV/EBITDA, PEG ratios</li>
        <li><strong>Profitability:</strong> Margins, ROE, ROA</li>
        <li><strong>Financial Health:</strong> Debt ratios, liquidity measures</li>
        <li><strong>Growth:</strong> Revenue and earnings growth</li>
        <li><strong>Analyst Consensus:</strong> Buy/hold/sell recommendations</li>
        <li><strong>Insider Activity:</strong> Recent insider transactions</li>
        <li><strong>AI Insights:</strong> Automated analysis and warnings</li>
        <li><strong>Fundamental Score:</strong> Overall rating 0-10</li>
      </ul>
    </div>

    <div class="card">
      <h2>⚡ Popular Stocks</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 16px;">
        <a href="/api/analyze/AAPL" class="try-btn" style="text-align: center;">AAPL</a>
        <a href="/api/analyze/MSFT" class="try-btn" style="text-align: center;">MSFT</a>
        <a href="/api/analyze/GOOGL" class="try-btn" style="text-align: center;">GOOGL</a>
        <a href="/api/analyze/AMZN" class="try-btn" style="text-align: center;">AMZN</a>
        <a href="/api/analyze/TSLA" class="try-btn" style="text-align: center;">TSLA</a>
        <a href="/api/analyze/META" class="try-btn" style="text-align: center;">META</a>
        <a href="/api/analyze/NVDA" class="try-btn" style="text-align: center;">NVDA</a>
        <a href="/api/analyze/NFLX" class="try-btn" style="text-align: center;">NFLX</a>
      </div>
    </div>

    <div class="card" style="background: #fef3c7; border-left: 4px solid #f59e0b;">
      <h2 style="color: #92400e;">⚠️ Disclaimer</h2>
      <p style="color: #78350f;">
        This API provides data for informational and educational purposes only.
        It does not constitute investment advice, financial advice, or trading advice.
        Always conduct your own research and consult with a qualified financial advisor
        before making any investment decisions.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Root path - show documentation
      if (url.pathname === '/' || url.pathname === '') {
        return new Response(generateDocsHTML(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // API endpoint pattern: /api/analyze/{symbol}
      const match = url.pathname.match(/^\/api\/analyze\/([A-Z0-9.]+)$/i);

      if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid endpoint. Use /api/analyze/{symbol}' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const symbol = match[1].toUpperCase();
      const format = url.searchParams.get('format') || 'html';

      // Analyze the stock
      const result = await analyzeFundamentals(symbol);

      // Return JSON or HTML based on format parameter
      if (format === 'json') {
        return new Response(JSON.stringify(result, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
          }
        });
      } else {
        return new Response(generateHTMLReport(result), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }

    } catch (error: any) {
      console.error('Error:', error);

      return new Response(JSON.stringify({
        error: 'Failed to analyze stock',
        message: error.message,
        hint: 'Make sure you are using a valid stock symbol (e.g., AAPL, MSFT, GOOGL)'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
