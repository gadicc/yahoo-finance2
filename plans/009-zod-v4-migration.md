# Plan 009: Move zod off the v3-compat subpath onto zod@^4

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- deno.json scripts/build_npm.ts src/mcp/server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (dependency swap on the MCP boundary; MCP SDK peer expectations must be checked)
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md (verification gate)
- **Category**: migration
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

The MCP server's schemas use zod via the `zod@3.25.x` package's `/v4` subpath —
the temporary bridge zod shipped inside its v3 line so users could migrate
incrementally. Standalone zod 4 has been stable since mid-2025. Staying on the
bridge means: pinned to the 3.25.x maintenance line (no zod-4-line fixes), an
import specifier (`zod/v4`) that reads as version-confusion, and an npm-build
mapping that ships `zod@^3.25.0` to npm consumers.

## Current state

- `deno.json:104` (in `imports`):

  ```json
  "zod/v4": "npm:zod@^3.25.0/v4"
  ```

- `src/mcp/server.ts:3` — the **only** source import
  (verified: `grep -rn "zod" src --include='*.ts' | grep -v test` → one hit):

  ```ts
  import * as z from "zod/v4";
  ```

  Usage in that file is plain object/enum/string/number schema building for
  MCP tool `inputSchema`s (e.g. `z.object({}).passthrough()` at line 34) —
  no exotic v3-only APIs.

- `scripts/build_npm.ts:97` — dnt build mapping for the npm package:

  ```ts
  "zod": "npm:zod@^3.25.0",
  ```

  (Read the surrounding mapping block before editing — it maps Deno import
  specifiers to npm dependencies for the generated package.)

- The MCP SDK dependency (`@modelcontextprotocol/sdk@^1.26.0` in deno.json)
  has its own zod peer expectations. **Check before migrating** (Step 1) — if
  the SDK version pinned here only accepts zod 3.x schemas at the
  `registerTool`/`inputSchema` boundary, this plan may require an SDK bump or
  may need to be abandoned; that's a STOP-and-report, not an improvisation.

- Relevant tests: `src/mcp/server.test.ts` and `src/mcp/http.test.ts` exercise
  tool registration and calls end-to-end (in-memory MCP client). Cloudflare
  npm-package smoke tests: `deno task test:cloudflare` (builds npm output
  first; slower — run once at the end).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| MCP tests | `deno task test src/mcp/server.test.ts src/mcp/http.test.ts` | all pass |
| Full suite | `deno task test` | 0 failed |
| Typecheck | `deno task check` | exit 0 |
| npm build + Workers smoke test | `deno task test:cloudflare` | build succeeds, vitest passes |
| Peer-dep check | `npm info @modelcontextprotocol/sdk@1.26 peerDependencies` | shows zod range |

## Scope

**In scope**:
- `deno.json` (the `zod/v4` import mapping; possibly `deno.lock` regeneration as a side effect)
- `src/mcp/server.ts` (import specifier)
- `scripts/build_npm.ts` (npm mapping)
- `tests/cloudflare/package-lock.json` **only if** `deno task lock:cloudflare`
  regenerates it as part of the npm-output change

**Out of scope** (do NOT touch):
- Any schema *logic* in `src/mcp/server.ts` — specifier swap only, unless a
  zod-4 breaking change forces a minimal API adjustment (each such adjustment
  must be listed in your report).
- `src/lib/validate/` — the hand-rolled JSON-schema validator is unrelated to
  zod (a zod rewrite of it was considered and rejected; see plans/README.md).
- `@modelcontextprotocol/sdk` version — unless Step 1 proves a bump is
  *required*, in which case STOP and report rather than bumping.

## Git workflow

- Branch from `dev`: `advisor/009-zod-v4`
- Conventional commit, e.g. `fix(deps): migrate zod from v3 compat subpath to zod@^4`.
  Per `AGENTS.md`, end the commit body with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Check the MCP SDK's zod compatibility

Run `npm info @modelcontextprotocol/sdk@1.26 peerDependencies` (and
`npm info @modelcontextprotocol/sdk versions | tail -5` for context).

**Verify**: the peer range admits zod 4 (e.g. `^3.25 || ^4`, or the SDK ships
its own zod handling that accepts both — the SDK's 1.x line added zod-4 support
via the same `/v4` bridge types, so standalone zod 4 schemas are structurally
identical). If the peer range **excludes** zod 4 → STOP condition.

### Step 2: Swap the mapping and the import

- `deno.json` imports: replace

  ```json
  "zod/v4": "npm:zod@^3.25.0/v4"
  ```

  with

  ```json
  "zod": "npm:zod@^4.0.0"
  ```

- `src/mcp/server.ts:3`: `import * as z from "zod/v4";` → `import * as z from "zod";`
- Refresh the lockfile: `deno install` (updates `deno.lock`).

**Verify**: `deno task check` → exit 0.
`grep -rn "zod/v4" src deno.json` → no matches.

### Step 3: Update the npm build mapping

In `scripts/build_npm.ts:97`, change `"zod": "npm:zod@^3.25.0",` to
`"zod": "npm:zod@^4.0.0",` — adjusting the mapping key if the build script
keys on the full Deno specifier (read the block; keys must match the specifier
used in `deno.json`/source after Step 2).

**Verify**: `deno task build:npm` → completes without error;
`grep -n '"zod"' npm/package.json` → shows `^4`.

### Step 4: Run the MCP and full suites

**Verify**: `deno task test src/mcp/server.test.ts src/mcp/http.test.ts` → all
pass. `deno task test` → 0 failed. If zod 4 renamed anything the file uses
(e.g. `.passthrough()` → in zod 4 classic API it still exists; the `z.object`
API surface used here is stable), make the minimal adjustment and list it.

### Step 5: Cloudflare npm smoke test

Run `deno task test:cloudflare`. If it fails on lockfile resolution, run
`deno task lock:cloudflare` and retry once.

**Verify**: vitest run passes.

## Test plan

No new tests — the existing MCP server/http tests already register every tool
schema and execute calls through an in-memory client, which is exactly the
surface zod touches. Full suite + Cloudflare smoke test are the gates.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "zod/v4\|zod@^3" src deno.json scripts/build_npm.ts` → no matches
- [ ] `deno task check` exits 0
- [ ] `deno task test` exits 0, 0 failed
- [ ] `deno task test:cloudflare` passes
- [ ] `git status` shows only in-scope files (plus `deno.lock`, `npm/` build output is NOT committed — check repo convention: `npm/` is committed generated output; if `git status` shows `npm/` changes from Step 3's build, include them only if the repo's history shows npm/ is tracked — verify with `git log --oneline -3 -- npm/` and match that convention)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows the pinned MCP SDK does not accept zod 4 — report the peer
  range and the SDK version that does; do not bump the SDK yourself.
- Typecheck or tests fail with zod API differences needing more than ~3 trivial
  renames — the "no exotic APIs" premise is wrong; report the list.
- `deno task test:cloudflare` fails for reasons unrelated to zod (pre-existing
  breakage) — report and mark the criterion blocked rather than chasing it.

## Maintenance notes

- Renovate (`renovate.json` exists) should pick up future zod 4.x bumps
  normally once off the pinned bridge.
- Reviewer: the diff should be ~4 lines plus lockfile; anything larger needs
  the Step 4 adjustment list in the PR description.
