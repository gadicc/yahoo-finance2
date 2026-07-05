# Plan 005: Add a CI check that generated *.schema.json files are in sync

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- deno.json .github/workflows/tests.yaml scripts/schema-gen.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 001 adds a `check` task to
> deno.json and a CI step — that diff is expected, not drift.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md (both edit tests.yaml; land 001 first)
- **Category**: dx
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

Runtime validation in this library is driven by `*.schema.json` files generated
from TypeScript interfaces (files containing the `@yf-schema` marker). The
generation is automatic **only in VS Code**; other contributors must remember
`deno task schema`. Nothing in CI verifies the generated files match the
interfaces, so a PR that edits an interface but forgets to regenerate merges
with stale runtime validation — the type says one thing, the validator enforces
another. A v2-era guard existed (`scripts/schema-check.sh`, still referencing
`yarn schema` and a single `schema.json`) but was never ported to the v3
layout. This plan adds a `schema:check` task and a CI step.

## Current state

- `scripts/schema-gen.ts` — the generator. Key facts verified by reading it:
  - Scans `src/**/*.ts` for files whose text matches `/@yf-schema/` (line 25,
    274–278) and writes `<file>.schema.json` next to each (line 29, 154).
  - **mtime-based skip**: `createSchema()` skips a file when the output is
    newer than the input (lines 46–49) — so a plain run on a fresh checkout may
    skip everything. The `--force`/`-f` flag (line 243–246) bypasses the skip.
  - `depsCheck()` (lines 169–231) symlinks `tough-cookie` from the Deno cache
    into `node_modules/` (needed by ts-json-schema-generator). It runs on every
    invocation and requires the Deno cache to be populated (`deno install` has
    run) — true in CI because `.github/actions/setup` runs `deno install --frozen`.
  - Output is deterministic JSON (`JSON.stringify(schema, null, 2)`, line 151)
    for a given generator version, so "regenerate + `git diff --exit-code`" is
    a valid staleness check.
- Current schema artifacts: 12 `src/modules/*.schema.json` files plus
  `src/modules/quoteSummary-iface.schema.json` (all committed).
- `deno.json` tasks (lines 4–19): has `"schema": "deno run -A scripts/schema-gen.ts"`,
  no check variant. Note the placeholder `"schema_": "TODO below..."` line —
  leave it alone.
- `.github/workflows/tests.yaml` — `tests` job steps (after plan 001):
  checkout → setup → `deno fmt --check` → `deno lint` → `deno task check` →
  `deno task test --coverage` → codecov.
- `deno.json` `fmt.exclude` already excludes `**/*.schema.json`, so formatting
  won't fight the generated output.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Regenerate all schemas | `deno task schema --force` | per-file "creating schema..." lines, exit 0 |
| Staleness check | `git diff --exit-code -- '*.schema.json'` | exit 0 when in sync |
| Full suite | `deno task test` | 0 failed |
| Typecheck | `deno task check` | exit 0 |

## Scope

**In scope**:
- `deno.json` (add one task)
- `.github/workflows/tests.yaml` (add one step)
- `CONTRIBUTING.md` (one sentence, Step 4)

**Out of scope** (do NOT touch):
- `scripts/schema-gen.ts` — no generator changes; if the check can't be built
  without changing it, STOP.
- Any `*.schema.json` file — unless Step 1 reveals they're stale, in which case
  committing the regenerated files is in scope (that's the check working), but
  investigate first (see STOP conditions).
- `scripts/schema-check.sh` — dead v2 code; plan 006 deletes it. Don't fix it.

## Git workflow

- Branch from `dev`: `advisor/005-schema-sync-ci`
- Conventional commit, e.g. `ci(schema): fail CI when generated schemas are stale`.
  Per `AGENTS.md`, end the commit body with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish that schemas are currently in sync

Run `git status --porcelain` (expect clean or only known files), then
`deno task schema --force`, then `git status --porcelain -- '*.schema.json'`.

**Verify**: no `*.schema.json` file is modified. If files ARE modified, see
STOP conditions — do not silently commit regenerated schemas without
understanding why they drifted.

### Step 2: Add the `schema:check` task

In `deno.json` tasks, next to the existing `"schema"` entry, add:

```json
"schema:check": "deno task schema --force && git diff --exit-code -- '*.schema.json'",
```

**Verify**: `deno task schema:check` → exit 0 on a clean tree. Then prove it
catches drift: append a temporary property to an exported interface in a
`@yf-schema` file (e.g. add `_tmpDrift?: string;` to an exported interface in
`src/modules/search.ts`), run `deno task schema:check` → **non-zero exit** with
a diff in `search.schema.json`. Revert both files
(`git checkout -- src/modules/search.ts src/modules/search.schema.json`).

### Step 3: Add the CI step

In `.github/workflows/tests.yaml`, `tests` job, after the `- run: deno task check`
step (added by plan 001), add:

```yaml
      - run: deno task schema:check
```

**Verify**: YAML parses (`deno eval "import { parse } from 'jsr:@std/yaml'; parse(Deno.readTextFileSync('.github/workflows/tests.yaml')); console.log('yaml ok')"` → `yaml ok`).

### Step 4: Document it

In `CONTRIBUTING.md`, in the "Schema Generation" section (around lines 54–63),
after the sentence describing `deno task schema`, add one sentence:

> CI runs `deno task schema:check` and will fail your PR if committed
> `.schema.json` files don't match the interfaces — run `deno task schema`
> before committing interface changes.

**Verify**: `deno fmt --check CONTRIBUTING.md` → exit 0 (run `deno fmt CONTRIBUTING.md` first if needed).

## Test plan

No unit tests — the verification is the drift-detection exercise in Step 2
(inject drift → check fails; revert → check passes) plus the full suite
remaining green: `deno task test` → 0 failed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `deno task schema:check` exits 0 on a clean tree
- [ ] The Step 2 drift exercise was performed and the check failed as expected (state this in your report)
- [ ] `grep -n "schema:check" .github/workflows/tests.yaml` → one match
- [ ] `deno task test` exits 0; `deno task check` exits 0
- [ ] `git status` shows only `deno.json`, `.github/workflows/tests.yaml`, `CONTRIBUTING.md` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows schema files changing on regeneration with no source edits.
  Likely causes: a previously-forgotten regeneration (report which interfaces
  drifted — this is itself a finding), or nondeterministic generator output
  (report the diff; the whole approach needs rethinking if output isn't stable).
- `deno task schema --force` errors (e.g. the `depsCheck` tough-cookie symlink
  fails in your environment).
- The check requires modifying `scripts/schema-gen.ts`.

## Maintenance notes

- The check costs one full schema generation per CI run (~seconds). If it ever
  becomes slow, scope it to changed files rather than removing it.
- If a future contributor adds a new `@yf-schema` file without committing its
  generated schema, `git diff --exit-code` won't catch a *new untracked* file —
  the module's own import of the missing `.schema.json` will fail loudly at
  test time instead, which is acceptable coverage.
- When `ts-json-schema-generator` is upgraded, expect a one-time regeneration
  commit; the check makes that visible instead of letting halves drift.
