---
name: yahoo-finance2
description: Use when building with the yahoo-finance2 TypeScript/Deno/npm library, using its Yahoo Finance data modules, CLI, or MCP server, or contributing to the yahoo-finance2 repository including modules, validation schemas, cached fixtures, and npm/JSR build output.
---

# yahoo-finance2

## What this skill is for

Use this skill when a task involves `yahoo-finance2`, including:

- Adding Yahoo Finance market data to a server-side JavaScript/TypeScript app.
- Choosing between `quote`, `chart`, `historical`, `quoteSummary`,
  `fundamentalsTimeSeries`, `screener`, `options`, or other modules.
- Using the package CLI or bundled MCP server.
- Modifying this repository's Deno source, tests, generated schemas, docs, or
  npm output build.

This is an unofficial Yahoo Finance client. Do not describe it as a supported
Yahoo API, and do not assume Yahoo data availability, freshness, or shape is
guaranteed.

## Using the package

Prefer the v3 class API:

```ts
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();
const quote = await yahooFinance.quote("AAPL");
console.log(quote?.regularMarketPrice, quote?.currency);
```

Do not use old v1/v2 singleton patterns such as
`yahooFinance.setGlobalConfig()`. In v3, instantiate with
`new YahooFinance(options)`.

This package is for server-side runtimes. Do not put direct Yahoo Finance calls
in browser/client bundles; Yahoo's CORS and cookie behavior require a server,
serverless, edge, Deno, Bun, or Node context.

## Module selection

- Use `search(query)` first when a symbol is uncertain.
- Use `quote(symbolOrSymbols)` for current or near real-time quote fields. It
  accepts one symbol or an array. Use `fields` to limit payloads; for keyed
  access, request object or map returns.
- Use `quoteCombine(symbol)` when many independent code paths need quote data;
  it debounces many single-symbol calls into fewer `quote()` requests.
- Use `chart(symbol, { period1, period2, interval })` for chart-ready historical
  data with events such as dividends and splits. `return: "array"` is easier to
  iterate; `return: "object"` mirrors Yahoo's native shape.
- Use `historical()` for a simpler OHLCV history interface.
- Use `quoteSummary(symbol, { modules })` for profile, price, summary detail,
  filings, ownership, recommendations, and other quote-summary modules. Request
  only the modules needed.
- Use `fundamentalsTimeSeries()` for financial statements. Since late 2024,
  quote-summary financial-statement modules such as `incomeStatementHistory`,
  `balanceSheetHistory`, and `cashflowStatementHistory` provide little data.
- Use `options(symbol)` for options chains.
- Use `screener()` instead of removed/deprecated daily gainers or losers
  modules. Common predefined screeners include `day_gainers`, `day_losers`, and
  `most_actives`.
- Use `trendingSymbols(region)`, `recommendationsBySymbol()`, and `insights()`
  for their specialized Yahoo Finance endpoints.

## Reliability, validation, and errors

Wrap module calls in `try/catch`. Network errors, Yahoo API errors, delisted
symbols, missing data, and validation failures are expected operating
conditions.

By default, returned data is validated and coerced so known dates become `Date`
objects and known result shapes are safe to consume. If validation fails, fixing
the typed interface and regenerated schema is usually better than turning
validation off.

Only use `{ validateResult: false }` when the caller accepts `unknown` output
and performs its own checks. Use `{ validateOptions: false }` only when
experimenting with Yahoo query parameters that the library does not yet model.

The default client queue limits concurrent Yahoo requests. Use constructor or
per-call `queue` options when you need stricter rate behavior:

```ts
const yahooFinance = new YahooFinance({
  queue: { concurrency: 2, interval: 250 },
});
```

## CLI and MCP

For quick shell use:

```bash
npx yahoo-finance2 search AMZN
npx yahoo-finance2 quote AAPL
npx yahoo-finance2 quoteSummary NVDA '{"modules":["assetProfile","secFilings"]}'
```

JSON-looking positional arguments are parsed as JSON. Successful piped output is
JSON-safe.

For MCP clients, the package includes a read-only Yahoo Finance MCP server:

```bash
npx -y -p yahoo-finance2 yahoo-finance-mcp
```

See `docs/mcp.md` for stdio, HTTP, embedded handler, and client registration
details.

## Contributing in this repository

Read `AGENTS.md` and `CONTRIBUTING.md` first. This repo is Deno-first
TypeScript; npm output is generated.

Edit source files under `src/`, not generated files under `npm/`, unless the
task explicitly asks for generated output. Preserve local `.ts` import
extensions.

Public module files usually follow this pattern:

- Typed query/result interfaces are the source of truth.
- Files with `@yf-schema` import their generated `.schema.json`.
- Module functions call `this._moduleExec()` with query defaults, runtime
  params, optional transforms, result transforms, schema keys, and module
  options.
- Overloads distinguish validated results from `{ validateResult: false }`,
  which returns `unknown`.

When changing an exported interface in a file marked `@yf-schema`, run:

```bash
deno task schema
```

If adding a module, wire it through `src/modules/index.ts`, `deno.json` exports,
docs/README links, README module lists when relevant, tests, and any CLI/MCP
exposure only when the module should be user-facing there.

## Tests and fixtures

Run all tests with:

```bash
deno task test
```

Run focused tests with:

```bash
deno task test src/modules/quote.test.ts
```

Use `deno task test:serial src/modules/quote.test.ts` when debugging or limiting
live Yahoo request concurrency.

Tests that touch Yahoo HTTP responses should call `setupCache()` from
`tests/common.ts`. Prefer the existing pattern:

```ts
const YahooFinance = createTestYahooFinance({ modules: { quote } });
const yf = new YahooFinance();

describe("quote", () => {
  setupCache();

  it("passes validation", async (t, onFinish) => {
    await yf.quote("AAPL", {}, {
      devel: { id: "quote-AAPL", t, onFinish },
    });
  });
});
```

Use fixture ids that match the module and scenario. `FETCH_DEVEL=nocache` forces
live network calls. `FETCH_DEVEL=recache` refreshes cache files for failing
tests. Do not recache fixtures ending in `.static.json` or `.fake.json`; they
are intentionally stable or synthetic.

When fixing validation failures, inspect the validation error path and cached
Yahoo response, update the TypeScript interface first, run schema generation,
then run the focused test.

## Build, lint, and release surface

Use these checks as appropriate:

```bash
deno fmt
deno lint
deno task test
deno task build:npm
```

`scripts/build_npm.ts` controls the generated npm package metadata, binaries,
dependencies, copied files, and package keywords. Keep npm-package changes there
unless explicitly regenerating `npm/`.

Commit messages should use Conventional Commits with a scope, such as
`fix(quote): handle missing extended market fields`.

## Agent skill installation

The canonical skill lives at `skills/yahoo-finance2/SKILL.md`. To install it
through the Skills CLI and make it visible to skills.sh telemetry, use:

```bash
npx skills add gadicc/yahoo-finance2
```
