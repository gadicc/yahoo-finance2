# MCP

`yahoo-finance2` includes a Model Context Protocol server for exposing the
library's Yahoo Finance modules to MCP clients.

The server supports:

- `stdio` for local MCP clients that spawn a process.
- Streamable HTTP for local or hosted integrations.
- Embedded handlers for applications that want to mount MCP into their own
  stack.

The initial MCP surface is a curated set of read-only tools:

```text
quote, search, quoteSummary, chart, historical, options, trendingSymbols,
screener, recommendationsBySymbol, insights, fundamentalsTimeSeries
```

Deprecated or decommissioned modules such as `autoc`, `dailyGainers`, and
`dailyLosers` are intentionally not exposed.

## Stdio

Use stdio when an MCP client launches the server as a child process:

```json
{
  "mcpServers": {
    "yahoo-finance2": {
      "command": "npx",
      "args": ["-p", "yahoo-finance2", "yahoo-finance-mcp"]
    }
  }
}
```

If installed globally, use the binary directly:

```bash
yahoo-finance-mcp
```

The stdio server writes diagnostics to stderr so stdout stays reserved for MCP
protocol messages.

## HTTP

Start a local Streamable HTTP server:

```bash
yahoo-finance-mcp --http
```

By default it listens on:

```text
http://127.0.0.1:3000/mcp
```

Change the bind address, port, or path:

```bash
yahoo-finance-mcp --http --host 127.0.0.1 --port 8787 --path /mcp
```

When binding to a non-local host, provide a bearer token:

```bash
YAHOO_FINANCE_MCP_TOKEN=secret yahoo-finance-mcp --http --host 0.0.0.0
```

Clients must send:

```text
Authorization: Bearer secret
```

The server refuses non-local HTTP binding without a token unless
`--unsafe-no-token` is explicitly supplied.

## Embedded Handlers

For Web Standard runtimes such as Deno, Bun, Hono, or Cloudflare Workers:

```ts
import YahooFinance from "yahoo-finance2";
import { createYahooFinanceMcpWebHandler } from "yahoo-finance2/mcp";

const yahooFinance = new YahooFinance();
const handler = createYahooFinanceMcpWebHandler({
  client: yahooFinance,
});

Deno.serve(handler);
```

For Node's `http` module:

```ts
import { createServer } from "node:http";
import YahooFinance from "yahoo-finance2";
import { createYahooFinanceMcpNodeHandler } from "yahoo-finance2/mcp";

const yahooFinance = new YahooFinance();
const handler = createYahooFinanceMcpNodeHandler({
  client: yahooFinance,
  bearerToken: process.env.YAHOO_FINANCE_MCP_TOKEN,
});

createServer(handler).listen(3000, "127.0.0.1");
```

## Tool Inputs

Most tools accept this shape:

```json
{
  "symbol": "AAPL",
  "queryOptions": {},
  "moduleOptions": {}
}
```

Tools that naturally use a different primary input use `query`, `region`, or
`scrId`. Examples:

```json
{ "query": ["AAPL", "MSFT"], "queryOptions": { "return": "object" } }
```

```json
{ "region": "US", "queryOptions": { "count": 10 } }
```

```json
{ "symbol": "AAPL", "queryOptions": { "period1": "2025-01-01" } }
```

`queryOptions` and `moduleOptions` are passed to the same yahoo-finance2 module
methods documented in the API reference.

## Security And Runtime Notes

- HTTP defaults to `127.0.0.1` and rejects unexpected Host headers.
- Use a bearer token for any non-local HTTP binding.
- The MCP server uses the same yahoo-finance2 validation, cookies, and request
  queue as normal library calls.
- The default request concurrency is still process-local. Multiple HTTP
  processes, workers, or containers each have their own queue.
- Yahoo Finance data may be delayed, unavailable, changed, or removed,
  especially for delisted symbols.
