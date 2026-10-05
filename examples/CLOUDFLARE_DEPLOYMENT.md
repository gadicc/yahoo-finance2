# Cloudflare Workers Deployment Guide

This guide will help you deploy the Stock Fundamental Analysis API to Cloudflare Workers as a serverless function.

## What You'll Get

After deployment, you'll have:
- ✅ A public API endpoint for stock fundamental analysis
- ✅ Beautiful HTML reports with interactive UI
- ✅ JSON API for programmatic access
- ✅ Serverless architecture (pay-per-use)
- ✅ Global CDN with low latency
- ✅ HTTPS by default
- ✅ Free tier: 100,000 requests/day

## Prerequisites

1. **Cloudflare Account** (free tier available)
   - Sign up at https://dash.cloudflare.com/sign-up

2. **Node.js & npm** (for Wrangler CLI)
   - Check: `node --version` (v16+ recommended)

3. **Wrangler CLI** (Cloudflare's deployment tool)
   ```bash
   npm install -g wrangler
   ```

## Step-by-Step Deployment

### Step 1: Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

### Step 2: Get Your Account ID (Optional but Recommended)

1. Go to https://dash.cloudflare.com
2. Click on "Workers & Pages" in the left sidebar
3. Your Account ID is displayed in the right sidebar
4. Update `wrangler.toml`:
   ```toml
   account_id = "your-account-id-here"
   ```

### Step 3: Deploy to Cloudflare Workers

From the root of the yahoo-finance2 repository:

```bash
wrangler deploy
```

That's it! Wrangler will:
- Bundle your TypeScript code
- Upload it to Cloudflare
- Provide you with a live URL

### Step 4: Test Your Deployment

After deployment, Wrangler will output a URL like:
```
https://stock-fundamental-analysis.your-subdomain.workers.dev
```

Test it:
```bash
# View documentation
curl https://stock-fundamental-analysis.your-subdomain.workers.dev/

# Analyze a stock (HTML)
curl https://stock-fundamental-analysis.your-subdomain.workers.dev/api/analyze/AAPL

# Get JSON response
curl https://stock-fundamental-analysis.your-subdomain.workers.dev/api/analyze/AAPL?format=json
```

## API Endpoints

### Root Path (Documentation)
```
GET /
```
Returns HTML documentation page with examples and quick links.

### Analyze Stock (HTML Report)
```
GET /api/analyze/{SYMBOL}
```

Example:
```bash
curl https://your-worker.workers.dev/api/analyze/MSFT
```

Returns a beautiful HTML report with:
- Company information
- Valuation metrics
- Profitability analysis
- Financial health
- Growth metrics
- Analyst recommendations
- Insider activity
- AI-generated insights and warnings

### Analyze Stock (JSON)
```
GET /api/analyze/{SYMBOL}?format=json
```

Example:
```bash
curl https://your-worker.workers.dev/api/analyze/GOOGL?format=json
```

Returns structured JSON:
```json
{
  "symbol": "GOOGL",
  "companyName": "Alphabet Inc.",
  "sector": "Technology",
  "industry": "Internet Content & Information",
  "currentPrice": 142.65,
  "metrics": {
    "priceToEarnings": 26.84,
    "priceToBook": 6.12,
    "profitMargin": 0.2584,
    "returnOnEquity": 0.2891,
    "debtToEquity": 0.098,
    "currentRatio": 2.89,
    "revenueGrowth": 0.107,
    "earningsGrowth": 0.042
  },
  "fundamentalScore": 8.2,
  "scoreRating": "EXCELLENT",
  "analysis": [
    "P/E ratio suggests potentially undervalued stock",
    "Strong profit margins indicate efficient operations",
    "High ROE shows effective use of shareholder equity",
    "Low debt levels indicate strong financial stability"
  ],
  "warnings": [],
  "recommendations": {
    "strongBuy": 12,
    "buy": 18,
    "hold": 5,
    "sell": 1,
    "strongSell": 0,
    "consensus": "STRONG BUY"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Usage Examples

### JavaScript/TypeScript
```typescript
const symbol = 'AAPL';
const response = await fetch(
  `https://your-worker.workers.dev/api/analyze/${symbol}?format=json`
);
const analysis = await response.json();

console.log(`${analysis.companyName} Score: ${analysis.fundamentalScore}/10`);
console.log(`Rating: ${analysis.scoreRating}`);
console.log('Insights:', analysis.analysis);
```

### Python
```python
import requests

symbol = 'TSLA'
response = requests.get(
    f'https://your-worker.workers.dev/api/analyze/{symbol}',
    params={'format': 'json'}
)
analysis = response.json()

print(f"{analysis['companyName']} Score: {analysis['fundamentalScore']}/10")
print(f"Rating: {analysis['scoreRating']}")
```

### cURL
```bash
# Multiple stocks analysis
for symbol in AAPL MSFT GOOGL AMZN TSLA; do
  echo "Analyzing $symbol..."
  curl -s "https://your-worker.workers.dev/api/analyze/$symbol?format=json" \
    | jq '{symbol, companyName, fundamentalScore, scoreRating}'
done
```

## Configuration Options

### Custom Domain (Optional)

To use your own domain:

1. Add your domain to Cloudflare
2. Update `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
   ]
   ```
3. Redeploy: `wrangler deploy`

### Environment Variables

Add environment-specific configurations:

```toml
[env.production]
name = "stock-analysis-prod"

[env.staging]
name = "stock-analysis-staging"
```

Deploy to specific environment:
```bash
wrangler deploy --env production
```

## Monitoring & Logs

### View Logs
```bash
wrangler tail
```

### View Metrics
Go to Cloudflare Dashboard → Workers & Pages → Your Worker → Metrics

You'll see:
- Request count
- Error rate
- CPU time
- Bandwidth usage

## Pricing

### Free Tier
- 100,000 requests/day
- Perfect for personal use and testing

### Paid Plan ($5/month)
- 10 million requests/month included
- $0.50 per additional million requests
- No cold starts
- Higher CPU limits

See: https://developers.cloudflare.com/workers/platform/pricing/

## Performance Optimization

### Caching
The worker includes cache headers (5 minutes):
```typescript
'Cache-Control': 'public, max-age=300'
```

### Global Distribution
Cloudflare automatically deploys to 275+ data centers worldwide.

### Rate Limiting (Optional)

Add rate limiting to prevent abuse:

```typescript
// In cloudflare-worker.ts
const RATE_LIMIT = 100; // requests per hour per IP

// Track requests using Cloudflare KV or Durable Objects
```

## Troubleshooting

### Error: "Module not found"
Make sure you're deploying from the repository root where `src/` exists.

### Error: "Exceeded CPU time"
Stock analysis can be CPU intensive. Consider:
- Using the paid plan for higher limits
- Implementing caching
- Optimizing the analysis code

### API Returns Old Data
Yahoo Finance caches data. This is normal. Consider adding timestamps to responses.

### CORS Issues
Add CORS headers if calling from a browser:

```typescript
headers: {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
}
```

## Local Development

Test locally before deploying:

```bash
wrangler dev
```

This starts a local server at http://localhost:8787

Test locally:
```bash
curl http://localhost:8787/api/analyze/AAPL?format=json
```

## Updating Your Deployment

Make changes to `examples/cloudflare-worker.ts` and redeploy:

```bash
wrangler deploy
```

Cloudflare Workers have zero downtime deployments!

## Security Best Practices

1. **Rate Limiting**: Implement rate limiting to prevent abuse
2. **Monitoring**: Set up alerts for unusual traffic patterns
3. **Validation**: The code validates all stock symbols
4. **No Secrets**: No API keys are required (Yahoo Finance is public)
5. **HTTPS Only**: Cloudflare enforces HTTPS automatically

## Advanced Features

### Multiple Workers

Deploy different versions:
```bash
# Production
wrangler deploy --env production

# Staging
wrangler deploy --env staging

# Development
wrangler dev
```

### Custom Analytics

Track popular stocks:
```typescript
// Add to cloudflare-worker.ts
await env.ANALYTICS.writeDataPoint({
  blobs: [symbol],
  doubles: [result.fundamentalScore],
  indexes: ['stock_analysis']
});
```

### Scheduled Analysis

Run analysis on a schedule:
```toml
# In wrangler.toml
[triggers]
crons = ["0 9 * * *"]  # Daily at 9 AM
```

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Analyze portfolio stocks daily
    const stocks = ['AAPL', 'MSFT', 'GOOGL'];
    for (const symbol of stocks) {
      const result = await analyzeFundamentals(symbol);
      // Store or send results
    }
  }
}
```

## Next Steps

1. ✅ Deploy your worker
2. 📊 Test with different stocks
3. 🎨 Customize the HTML template
4. 📈 Add more metrics or analysis
5. 🔔 Set up monitoring alerts
6. 🌐 Add a custom domain
7. 📱 Build a frontend app that uses your API

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [Yahoo Finance2 Docs](../../README.md)

## Support

- **Cloudflare Workers**: [Community Discord](https://discord.gg/cloudflaredev)
- **Yahoo Finance2**: [GitHub Issues](https://github.com/gadicc/node-yahoo-finance2/issues)

## License

Same as yahoo-finance2 (MIT License)
