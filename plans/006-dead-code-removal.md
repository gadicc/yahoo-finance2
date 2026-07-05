# Plan 006: Remove dead code — csv2json path and stale scripts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- src/lib/csv2json.ts src/lib/moduleExec.ts src/lib/yahooFinanceFetch.ts src/modules/historical.ts scripts/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md (verification gate). Coordinate with plan 004 (also edits `yahooFinanceFetch.ts` — land 004 first or rebase).
- **Category**: tech-debt
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

The CSV pipeline is dead: the only module that ever set `fetchType: "csv"` is
`historical`, whose CSV retrieval was moved into a comment block when Yahoo
retired the download endpoint ("Original historical() retrieval code when
Yahoo API still existed"). The `csv2json` parser it fed has known limitations
(no quoted-field handling, unanchored date/number coercion regexes) that would
be findings if the code were live — the cheapest correct fix is deletion.
Separately, `scripts/` carries v2-era corpses (`schema-check.sh` still calls
`yarn schema`; `.old`/`.unused` files) that mislead anyone exploring how schema
generation works today.

## Current state

- `src/lib/csv2json.ts` (43 lines) — hand-rolled CSV→JSON. Live importers,
  verified by `grep -rn "csv2json" src --include='*.ts' | grep -v test`:
  only `src/lib/moduleExec.ts`.
- `src/lib/csv2json.test.ts` — tests for the dead module.
- `src/lib/moduleExec.ts:203`:

  ```ts
  if (queryOpts.fetchType === "csv") result = csv2json(result);
  ```

  plus the corresponding `import csv2json from "./csv2json.ts";` near the top
  of the file.
- `src/lib/yahooFinanceFetch.ts:170-171`:

  ```ts
  // used in moduleExec.ts
  if (func === "csv") func = "text";
  ```

- The only occurrence of `fetchType: "csv"` in `src/` is inside the commented
  block at `src/modules/historical.ts:506-517` (block begins
  `/* // Original historical() retrieval code when Yahoo API still existed.`).
- The `fetchType` option type: find its declaration with
  `grep -rn "fetchType" src/lib/moduleExec.ts` — if it's a union including
  `"csv"`, the `"csv"` member should be dropped too.
- Stale files under `scripts/` (none referenced by `deno.json` tasks, CI
  workflows, or any import — verified):
  - `scripts/schema-check.sh` (v2: `yarn schema`, single `schema.json`)
  - `scripts/schema-compile.ts.unused`
  - `scripts/schema.ts.old`
  - `scripts/timeseries.ts.old`
  - plus any `.old` files under `scripts/schema/TypeFormatter/` — list with
    `find scripts -name '*.old' -o -name '*.unused'` and inspect before deleting.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full suite | `deno task test` | 0 failed (test count drops by the csv2json cases) |
| Typecheck | `deno task check` | exit 0 |
| Lint/format | `deno lint && deno fmt --check` | exit 0 |
| Dead-ref check | `grep -rn "csv2json\|fetchType.*csv" src bin scripts --include='*.ts' --include='*.sh'` | only the commented historical.ts block (or nothing, see Step 3) |

## Scope

**In scope**:
- Delete: `src/lib/csv2json.ts`, `src/lib/csv2json.test.ts`,
  `scripts/schema-check.sh`, `scripts/schema-compile.ts.unused`,
  `scripts/schema.ts.old`, `scripts/timeseries.ts.old`, and `.old` files under
  `scripts/schema/` (after inspection).
- Edit: `src/lib/moduleExec.ts` (remove import + line 203 + `"csv"` from the
  `fetchType` type if present), `src/lib/yahooFinanceFetch.ts` (remove lines 170–171).

**Out of scope** (do NOT touch):
- `src/modules/historical.ts` — leave the commented legacy block exactly as is;
  it documents the old endpoint and the maintainer may want the history.
- `scripts/schema-gen.ts`, `scripts/schema-tsconfig.json`, `scripts/schema/`
  files that are **imported** by schema-gen (check imports before assuming a
  file is dead — `yfFunctionIgnorer.ts` IS used).
- `src/lib/timeseries.json` — live (imported by `fundamentalsTimeSeries.ts:195`).
- `npm/` — generated.

## Git workflow

- Branch from `dev`: `advisor/006-dead-code-removal`
- Two commits: `refactor(lib): remove dead csv2json pipeline` and
  `chore(scripts): remove stale v2-era schema scripts`.
  Per `AGENTS.md`, end commit bodies with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify deadness (cheap insurance)

```
grep -rn "csv2json" src bin scripts --include='*.ts'
grep -rn "fetchType" src --include='*.ts' | grep -v test
grep -rn "schema-check\|schema-compile\|schema\.ts\.old\|timeseries\.ts\.old" deno.json .github scripts src
```

**Verify**: csv2json referenced only by `src/lib/csv2json.ts` itself,
`src/lib/csv2json.test.ts`, and `src/lib/moduleExec.ts`; `fetchType: "csv"`
only in historical.ts's comment block; the stale scripts referenced nowhere.

### Step 2: Remove the csv path from live code

- In `src/lib/moduleExec.ts`: delete the `csv2json` import and line 203
  (`if (queryOpts.fetchType === "csv") result = csv2json(result);`). If the
  `fetchType` option is typed as a union containing `"csv"`, remove that member.
- In `src/lib/yahooFinanceFetch.ts`: delete lines 170–171
  (`// used in moduleExec.ts` / `if (func === "csv") func = "text";`).

**Verify**: `deno task check` → exit 0. `deno task test` → 0 failed.

### Step 3: Delete the dead files

```
git rm src/lib/csv2json.ts src/lib/csv2json.test.ts
git rm scripts/schema-check.sh scripts/schema-compile.ts.unused scripts/schema.ts.old scripts/timeseries.ts.old
find scripts -name '*.old' -o -name '*.unused'   # inspect any remainder, git rm if unreferenced
```

**Verify**: `deno task test && deno task check && deno lint && deno fmt --check`
→ all exit 0. `grep -rn "csv2json" src bin scripts` → no matches.

### Step 4: Regenerate schemas if the option type changed

If Step 2 changed a type inside a `@yf-schema` file (check whether
`moduleExec.ts` or the file declaring `fetchType` contains `@yf-schema`), run
`deno task schema` and commit any regenerated `.schema.json`.

**Verify**: `git status` — either no schema changes (type wasn't in a schema
file) or coherent regenerated schema diffs. If plan 005 has landed:
`deno task schema:check` → exit 0.

## Test plan

Deletion plan — the net is the existing suite: `deno task test` must exit 0
with only the csv2json test cases removed from the count. No new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test ! -f src/lib/csv2json.ts && test ! -f scripts/schema-check.sh` (and the other three stale files gone)
- [ ] `grep -rn "csv2json" src bin scripts` → no matches
- [ ] `grep -rn '"csv"' src/lib/` → no matches
- [ ] `deno task test` exits 0; `deno task check`, `deno lint`, `deno fmt --check` exit 0
- [ ] `git status` clean apart from the deletions/edits listed in Scope
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds a live (non-comment) reference to `csv2json` or
  `fetchType: "csv"` anywhere outside `src/lib/moduleExec.ts` — the deadness
  premise is wrong.
- Removing the `"csv"` union member cascades type errors into more than the two
  in-scope lib files.
- Any file under `scripts/schema/` you're about to delete turns out to be
  imported by `scripts/schema-gen.ts`.

## Maintenance notes

- If Yahoo ever reintroduces a CSV endpoint, the parser is retrievable from git
  history (`git log --diff-filter=D -- src/lib/csv2json.ts`) — but prefer a
  proper RFC-4180 parser then; the deleted one didn't handle quoted fields.
- Reviewer: confirm historical.ts is untouched and the diff contains no
  behavior changes beyond the removed dead branch.
