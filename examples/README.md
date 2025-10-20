# Yahoo Finance Examples

This directory contains example applications demonstrating how to use the yahoo-finance2 library for various financial analysis tasks.

## Fundamental Analysis App

A comprehensive stock fundamental analysis tool that evaluates stocks across multiple dimensions.

### Features

The fundamental analysis app provides:

#### Valuation Metrics
- **P/E Ratio**: Price-to-earnings ratio for relative valuation
- **P/B Ratio**: Price-to-book ratio for asset-based valuation
- **P/S Ratio**: Price-to-sales ratio
- **EV/EBITDA**: Enterprise value to EBITDA
- **PEG Ratio**: Price/Earnings to Growth ratio

#### Profitability Metrics
- **Profit Margin**: Net income as percentage of revenue
- **Operating Margin**: Operating income as percentage of revenue
- **ROE**: Return on equity
- **ROA**: Return on assets

#### Financial Health
- **Debt-to-Equity**: Leverage ratio
- **Current Ratio**: Short-term liquidity measure
- **Quick Ratio**: Conservative liquidity measure

#### Growth Metrics
- **Revenue Growth**: Year-over-year revenue growth
- **Earnings Growth**: Year-over-year earnings growth

#### Additional Analysis
- **Analyst Recommendations**: Consensus buy/sell recommendations
- **Insider Activity**: Recent insider purchases and sales
- **Fundamental Score**: Overall score from 0-10 based on all metrics
- **AI-Generated Insights**: Key strengths and warnings

### Usage

#### With Deno (Recommended)

```bash
deno run --allow-net --allow-env examples/fundamental-analysis.ts AAPL
```

#### With Node.js

```bash
node examples/fundamental-analysis.ts MSFT
```

#### With Bun

```bash
bun run examples/fundamental-analysis.ts GOOGL
```

### Example Output

```
================================================================================
  FUNDAMENTAL ANALYSIS REPORT
================================================================================

Company: Apple Inc. (AAPL)
Sector: Technology
Industry: Consumer Electronics
Current Price: $175.43
Market Cap: $2.75T

Fundamental Score: 8.5/10 (EXCELLENT)

VALUATION METRICS
────────────────────────────────────────────────────────────────────────────────
P/E Ratio (Trailing):     28.45
Price to Book:            42.30
Price to Sales:           7.45
EV/EBITDA:               21.20
PEG Ratio:                2.15

PROFITABILITY METRICS
────────────────────────────────────────────────────────────────────────────────
Profit Margin:            25.31%
Operating Margin:         30.74%
Return on Equity (ROE):   160.58%
Return on Assets (ROA):   22.07%

...
```

### How It Works

1. **Data Collection**: Fetches comprehensive data using `quoteSummary` module with multiple sub-modules:
   - `price`: Current market price and basic info
   - `summaryDetail`: Key statistics and ratios
   - `financialData`: Profitability and financial health metrics
   - `defaultKeyStatistics`: Valuation ratios
   - `assetProfile`: Company information
   - `recommendationTrend`: Analyst recommendations
   - `insiderTransactions`: Insider buying/selling activity

2. **Metric Calculation**: Extracts and organizes key fundamental metrics

3. **Scoring System**: Calculates a weighted fundamental score (0-10) based on:
   - Valuation (25% weight)
   - Profitability (30% weight)
   - Financial Health (25% weight)
   - Growth (20% weight)

4. **Analysis Generation**: Provides insights and warnings based on:
   - Industry-standard metric thresholds
   - Comparative analysis
   - Risk factors

5. **Report Generation**: Formats and displays a comprehensive report with color-coded outputs

### Scoring Guide

- **8.0-10.0**: Excellent fundamentals - Strong candidate for investment research
- **6.5-7.9**: Good fundamentals - Above-average metrics
- **5.0-6.4**: Average fundamentals - Mixed signals
- **3.5-4.9**: Below average - Significant concerns
- **0.0-3.4**: Poor fundamentals - High risk

### Use Cases

1. **Stock Screening**: Quickly evaluate multiple stocks
   ```bash
   for symbol in AAPL MSFT GOOGL AMZN; do
     deno run --allow-net --allow-env examples/fundamental-analysis.ts $symbol
   done
   ```

2. **Investment Research**: Deep dive into a specific stock's fundamentals

3. **Portfolio Review**: Analyze existing holdings

4. **Comparative Analysis**: Compare stocks in the same sector

### Customization

The app is designed to be easily customizable. Key areas for modification:

1. **Scoring Weights**: Adjust weights in `calculateFundamentalScore()` function
2. **Metric Thresholds**: Modify scoring functions (e.g., `getValuationScore()`)
3. **Additional Metrics**: Add more data from the `quoteSummary` module
4. **Output Format**: Customize `printAnalysisReport()` for different formats (JSON, CSV, etc.)

### Important Notes

- **Data Accuracy**: Data is fetched from Yahoo Finance and may have delays
- **Not Investment Advice**: This tool is for educational and research purposes only
- **Market Conditions**: Always consider current market conditions and macro factors
- **Sector Differences**: Different sectors have different "normal" ranges for metrics
- **Additional Research**: Use this as a starting point, not the sole basis for decisions

### Disclaimer

This application is provided for informational and educational purposes only. It does not constitute investment advice, financial advice, trading advice, or any other sort of advice. Always conduct your own research and consult with a qualified financial advisor before making any investment decisions.

## Contributing

Feel free to contribute additional examples or improvements to existing ones!
