# MCP

`yahoo-finance2` includes a Model Context Protocol server for exposing the
library's Yahoo Finance modules to MCP clients.

The server supports:

- `stdio` for local MCP clients that spawn a process.
- Streamable HTTP for local or hosted integrations.
- Embedded handlers for applications that want to mount MCP into their own
  stack.

The MCP surface is a curated set of read-only tools:

```text
quote, quoteCombine, search, quoteSummary, chart, historical, options,
trendingSymbols, screener, recommendationsBySymbol, insights,
fundamentalsTimeSeries
```

Deprecated or decommissioned modules such as `autoc`, `dailyGainers`, and
`dailyLosers` are intentionally not exposed.

Contents:

- [Quick Start](#quick-start)
- [Transports And Integration Modes](#transports-and-integration-modes)
- [Tool Inputs](#tool-inputs)
- [Security And Runtime Notes](#security-and-runtime-notes)

## Quick Start

For local development from this repository, replace the `npx` command in the
examples below with:

```bash
deno run -A /path/to/yahoo-finance2/bin/yahoo-finance-mcp.ts
```

For the published package, use:

```bash
npx -y -p yahoo-finance2 yahoo-finance-mcp
```

### Codex CLI

Register the stdio server:

```bash
codex mcp add yahoo-finance2 -- npx -y -p yahoo-finance2 yahoo-finance-mcp
```

Smoke test:

```bash
codex exec "Use the yahoo-finance2 MCP server to search for Apple, then get a quote for AAPL. Return the symbol, short name, currency, market state, and regular market price."
```

Remove the server when done:

```bash
codex mcp remove yahoo-finance2
```

### Claude Code

Register the stdio server:

```bash
claude mcp add --transport stdio yahoo-finance2 -- npx -y -p yahoo-finance2 yahoo-finance-mcp
```

Inside Claude Code, use `/mcp` to verify that the server is connected.

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "yahoo-finance2": {
      "command": "npx",
      "args": ["-y", "-p", "yahoo-finance2", "yahoo-finance-mcp"]
    }
  }
}
```

### Cursor

For project-local configuration, create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "yahoo-finance2": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "yahoo-finance2", "yahoo-finance-mcp"]
    }
  }
}
```

For global configuration, use `~/.cursor/mcp.json` instead.

### VS Code

For workspace configuration, create `.vscode/mcp.json`:

```json
{
  "servers": {
    "yahooFinance2": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "yahoo-finance2", "yahoo-finance-mcp"]
    }
  }
}
```

VS Code also supports adding MCP servers through the command palette with
`MCP: Add Server`.

## Transports And Integration Modes

### Stdio

Use stdio when an MCP client launches the server as a child process:

```json
{
  "mcpServers": {
    "yahoo-finance2": {
      "command": "npx",
      "args": ["-y", "-p", "yahoo-finance2", "yahoo-finance-mcp"]
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

### HTTP

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

### Embedded Handlers

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
`scrId`. For example, `quote` accepts one symbol or an array:

```json
{ "query": ["AAPL", "MSFT"], "queryOptions": { "return": "object" } }
```

`quoteCombine` accepts a single symbol through `query`:

```json
{ "query": "AAPL", "queryOptions": { "fields": ["regularMarketPrice"] } }
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
