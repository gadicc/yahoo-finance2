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
- Modifying this repository's TypeScript source, tests, generated schemas, docs, or
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

Read `AGENTS.md` and `CONTRIBUTING.md` first. Development uses exact Bun 1.4.3,
TypeScript 6.0.3 and Biome 2.5.15; npm output is generated. Consumers require
Node >=22, Bun >=1.4.3 or Deno >=2, with JSR retained. A Deno binary is permitted
only inside the isolated publisher, never ordinary development or validation.

Select Bun 1.4.3 on PATH, run `bun run check:toolchain`, then
`bun install --frozen-lockfile` with normal hooks. Root dependencies use only
`bun.lock`; the private root manifest is not the public npm manifest. Workers
retain their independent npm 10.9.9 graph; follow `tests/migration/WORKERS.md`.

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
bun run schema
```

If adding a module, wire it through `src/modules/index.ts`, `deno.json` exports,
docs/README links, README module lists when relevant, tests, and any CLI/MCP
exposure only when the module should be user-facing there.

## Tests and fixtures

Run all tests with:

```bash
bun run test:replay
```

Run focused tests with:

```bash
bun run test:serial -- src/modules/quote.test.ts
```

Use focused/serial replay for iteration. Full strict validation also covers
compiler/package/subprocess/kernel tooling, so its timing is not the original
1,319-test/43-file benchmark. Strict replay requires Linux, Bubblewrap, Python 3,
libseccomp and namespace support, and fails closed. Direct `bun test` bypasses
that boundary. Explicit `bun run test:native` offers narrower trusted portable
replay with a read-only FMC store and fixture-byte checks, without an OS sandbox
or automatic retry. See `tests/migration/TESTING.md` and `NATIVE-REPLAY.md`.

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

Use fixture ids that match the module and scenario. Replay misses fail; neither
deleting a fixture nor inherited `FETCH_DEVEL` enables ordinary live capture.
Live recache/country capture is separately authorized work with both
`FETCH_DEVEL=recache` and explicit `--live`, after a strict baseline. Follow
`tests/migration/RECACHE.md` and `COUNTRY-CAPTURE.md`; generic recache protects
static/fake/geographic fixtures. Never retain rate limits, consent, timeout or
upstream 5xx responses as replacements for successful fixtures.

Inspect successful response evidence before changing interfaces. Model new fields
as required first; optionality needs successful omission evidence in the same
shape, including older/static/fake fixtures. Distinguish absence from null or
empty containers. Automated repairs only change interfaces, add distinct observed
plain strings to existing nongeneric string-literal-union aliases, and regenerate
schemas. Preserve alias names/modifiers and every old literal in order, including
duplicates. Other edits need manual review; if runtime/assertion/fixture changes
are required, report evidence and await operator feedback for that repair while
continuing independent type/schema work. Never disable validation to pass tests.

Regenerate all affected schemas before replay, including imported-type consumers:
use explicit `bun run schema` paths or `bun run schema --force`. Replay focused
cached tests, then the full suite; inspect generated diffs and Git status without
recaching during verification.

## Build, lint, and release surface

Use these checks as appropriate:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run typecheck:negative
bun run schema:check
bun run docs:lint
bun run test:replay
bun run build:npm
```

`scripts/build_npm.ts` controls the generated npm package metadata, binaries,
dependencies, copied files, and package keywords. `bun run format` writes style
changes. New/empty outside build outputs need an existing canonical parent;
nonempty default output requires the builder ownership marker. Keep package changes there
unless explicitly regenerating `npm/`.

Commit messages should use Conventional Commits with a scope, such as
`fix(quote): handle missing extended market fields`. Preserve the agent coauthor
footer and independent review/model policy in `AGENTS.md`. Release/publisher work
has separate authorization; follow `docs/RELEASING.md` and do not run live CLI,
authentication or publication as routine verification. CLI/MCP trust limits are
in `tests/migration/TRUST-BOUNDARIES.md`.

## Agent skill installation

The canonical skill lives at `skills/yahoo-finance2/SKILL.md`. To install it
through the Skills CLI and make it visible to skills.sh telemetry, use:

```bash
npx skills add gadicc/yahoo-finance2
```
