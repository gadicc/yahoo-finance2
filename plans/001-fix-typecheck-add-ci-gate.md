# Plan 001: Make `deno check` pass and gate CI on it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- src/lib/getCrumb.ts deno.json .github/workflows/tests.yaml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / bug
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

The repo does not typecheck today: `deno check bin/yahoo-finance-mcp.ts` fails
with 14 errors, all in `src/lib/getCrumb.ts`. CI (`.github/workflows/tests.yaml`)
runs `deno fmt --check`, `deno lint`, and `deno task test` — but never `deno check` —
so type regressions merge silently. This plan fixes the existing errors and adds
a `check` task plus a CI step so it can't regress. Every other plan in this
directory uses `deno task check` as a verification gate, so this plan must land first.

## Current state

- `src/lib/getCrumb.ts` — Yahoo crumb/cookie fetcher. The broken type is at line 23:

  ```ts
  // src/lib/getCrumb.ts:23-25
  type CrumbOptions = Parameters<typeof fetch>[1] & {
    devel?: YahooFinanceFetchModuleOptions["devel"];
  };
  ```

  All 14 errors are TS2339/TS2353 "Property 'headers' does not exist on type
  'RequestInit & { devel?: ... }'" at getCrumb.ts lines 89, 90, 117, 118, 140,
  141, 174, 175, 220, 221, 264, 265, 358, 359 — every place that spreads or
  assigns `.headers` on a `CrumbOptions` value.

- **Root cause (verified empirically)**: the errors appear only when `@types/node`
  is in the compilation scope. `bin/yahoo-finance-mcp.ts` imports `node:http`,
  which brings in Node's fetch typings; in that context `Parameters<typeof fetch>[1]`
  resolves to a type without `.headers`. A plain `RequestInit` does **not** have
  this problem. Verified with a minimal repro: a file containing
  `import type { IncomingMessage } from "node:http"` plus
  `type A = Parameters<typeof fetch>[1] & { devel?: string }` fails on `a.headers`,
  while `type B = RequestInit & { devel?: string }` passes. Consequently:
  - `deno check src/index.ts` → passes
  - `deno check src/mcp/mod.ts` → passes
  - `deno check bin/yahoo-finance.ts` → passes
  - `deno check bin/yahoo-finance-mcp.ts` → **14 errors**

- `deno.json` — `tasks` block (lines 4–19) has `test`, `schema`, `build:npm`,
  docs tasks… but no `check` task.

- `.github/workflows/tests.yaml` — the `tests` job runs, in order:
  `deno fmt --check`, `deno lint`, `deno task test --coverage`, codecov upload.
  No typecheck step.

- Note: `src/lib/yahooFinanceFetch.ts:17-19` also uses `Parameters<typeof fetch>`
  (inside the `fetchDevel` function type). That usage only names parameter types
  and does not currently error — leave it alone unless `deno check` reports it.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (after fix) | `deno task check` | exit 0 |
| Typecheck (before fix) | `deno check bin/yahoo-finance-mcp.ts` | 14 errors (confirms you're seeing the same baseline) |
| Tests | `deno task test` | `ok \| 51 passed (1340 steps) \| 0 failed \| 1 ignored` |
| Lint | `deno lint` | `Checked 103 files`, exit 0 |
| Format | `deno fmt --check` | exit 0 (run `deno fmt <file>` on files you edit first) |

## Scope

**In scope** (the only files you should modify):
- `src/lib/getCrumb.ts` (the `CrumbOptions` type only)
- `deno.json` (add one task)
- `.github/workflows/tests.yaml` (add one step)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/yahooFinanceFetch.ts` — its `Parameters<typeof fetch>` usage doesn't error; changing it risks churn in the fetch layer for no gain.
- `npm/` — generated output; never edit.
- Any behavioral change to getCrumb — this is a types-only fix.

## Git workflow

- Branch from `dev`: `advisor/001-fix-typecheck`
- Conventional commits with scope, matching repo style (see `git log`, e.g. `fix(insights): accept updated report fields`). Suggested: `fix(getCrumb): use RequestInit for CrumbOptions so deno check passes` and `ci(tests): add deno check gate`.
- Per `AGENTS.md`, end commit bodies with a `Co-authored-by:` line naming the assistant/model.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the baseline failure

Run `deno check bin/yahoo-finance-mcp.ts`.

**Verify**: output ends with `Found 14 errors.` — all in `src/lib/getCrumb.ts`.

### Step 2: Fix `CrumbOptions`

In `src/lib/getCrumb.ts:23-25`, change:

```ts
type CrumbOptions = Parameters<typeof fetch>[1] & {
  devel?: YahooFinanceFetchModuleOptions["devel"];
};
```

to:

```ts
type CrumbOptions = RequestInit & {
  devel?: YahooFinanceFetchModuleOptions["devel"];
};
```

Then run `deno fmt src/lib/getCrumb.ts`.

**Verify**: `deno check bin/yahoo-finance-mcp.ts` → exit 0, no errors.
Also `deno check src/index.ts src/mcp/mod.ts bin/yahoo-finance.ts` → exit 0.

### Step 3: Add a `check` task to deno.json

In the `tasks` object of `deno.json`, add (keep alphabetical-ish placement near
the other verification tasks):

```json
"check": "deno check src/index.ts src/mcp/mod.ts bin/yahoo-finance.ts bin/yahoo-finance-mcp.ts",
```

These four entrypoints transitively cover the whole library, the CLI, and the
MCP server (including the node-types context that exposed this bug).

**Verify**: `deno task check` → exit 0.

### Step 4: Add the CI gate

In `.github/workflows/tests.yaml`, in the `tests` job, directly after the
`- run: deno lint` line, add:

```yaml
      - run: deno task check
```

**Verify**: `deno task test` → all pass. `deno fmt --check` → exit 0.
Optionally validate workflow syntax with `deno eval "import { parse } from 'jsr:@std/yaml'; parse(Deno.readTextFileSync('.github/workflows/tests.yaml')); console.log('yaml ok')"` → `yaml ok`.

## Test plan

No new tests — this is a types-only fix plus tooling. The full existing suite
is the regression net: `deno task test` must stay at 51 passed / 0 failed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `deno task check` exits 0
- [ ] `deno task test` exits 0 (51 passed, 0 failed)
- [ ] `deno lint` and `deno fmt --check` exit 0
- [ ] `grep -n "Parameters<typeof fetch>\[1\]" src/lib/getCrumb.ts` returns no matches
- [ ] `grep -n "deno task check" .github/workflows/tests.yaml` returns one match
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The baseline in Step 1 is not 14 errors in getCrumb.ts (codebase drifted).
- After Step 2, `deno check` reports errors in files other than `getCrumb.ts` —
  the RequestInit swap surfaced a different incompatibility; report the exact
  errors instead of chasing them across the fetch layer.
- Fixing requires changing any runtime behavior (anything other than a type alias).

## Maintenance notes

- The underlying hazard remains: any module that imports `node:*` changes which
  fetch typings win. If a future entrypoint adds node imports and `deno task check`
  breaks in `src/lib`, suspect the same mechanism.
- Reviewer should confirm the diff to `getCrumb.ts` is exactly one type alias line.
- Deferred: `yahooFinanceFetch.ts`'s `Parameters<typeof fetch>` usages (currently harmless).
