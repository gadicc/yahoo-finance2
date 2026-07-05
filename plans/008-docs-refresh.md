# Plan 008: Docs refresh — remove stale v2/pre-v3 language and broken links

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- README.md CONTRIBUTING.md docs/README.md docs/UPGRADING.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 005 adds one sentence to
> CONTRIBUTING.md's schema section — expected, not drift.)

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW (text-only; the one risky part — the module checklist — has its own verification)
- **Depends on**: none (soft-order after plan 005 to avoid CONTRIBUTING.md conflicts)
- **Category**: docs
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

v3 shipped in early 2025 and is the published `@latest`, but the front-door
docs still describe it as upcoming, and CONTRIBUTING still carries v2-era
instructions (`yarn generateSchema`, a checklist referencing
`src/index-common.ts` which no longer exists, the old repo clone URL). A
contributor following those instructions today wastes a PR cycle. There is
also a literally broken link in the README (a JSR URL typo'd `moduless`).

## Current state

All excerpts verified at commit `8d4a72f`:

- `README.md:14-17`:
  > You are reading the latest **Development docs**. For the **v2 docs**, click
  > [here](...tree/2.x). The dev docs are in the process of being updated for
  > the upcoming **v3** - for more info see [UPGRADING](./docs/UPGRADING.md).

  Contradicted by `docs/UPGRADING.md:13`: "**v3 is now official and published
  with the @latest tag**".

- `README.md:86` — broken link:
  `https://jsr.io/@gadicc/yahoo-finance2/doc/moduless/insights` (note
  `moduless`; every sibling link on lines 83–102 uses `modules/`).

- `CONTRIBUTING.md:27-28` — clone instructions use the old repo name:
  `git clone https://github.com/gadicc/node-yahoo-finance2.git` /
  `cd node-yahoo-finance2`. README:22-24 states the repo was renamed to
  `yahoo-finance2`.

- `CONTRIBUTING.md:143-144`: "We're still writing these docs ahead of the
  official v3 release."

- `CONTRIBUTING.md:146-177` — a trailing section headed
  `# Old Version 2 doc sections still to be updated:` containing: empty
  `## Testing` and `## Specific Guidelines` headers, a `TODO` line, and an
  "Adding a new module" checklist that references `yarn generateSchema`
  (v2 tooling — now `deno task schema`) and `src/index-common.ts` (does not
  exist; module wiring now lives in `src/modules/index.ts` and `src/index.ts`,
  with exports in `deno.json`), plus `docs/modules/myAmazingModule.md`
  (`docs/modules/` does not exist; module docs are JSDoc → JSR now).

- `docs/README.md:19` — "Common Options" section says "Coming soon. Briefly:"
  followed by a skeleton snippet.

- `docs/UPGRADING.md:50` — ends a paragraph with "XXX TODO helper APIs XXX".

Formatting: markdown in this repo is formatted by `deno fmt` (CI enforces
`deno fmt --check`). Run `deno fmt <file>` after editing.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Format | `deno fmt README.md CONTRIBUTING.md docs/README.md docs/UPGRADING.md` then `deno fmt --check` | exit 0 |
| Link sanity (optional, network) | `curl -s -o /dev/null -w '%{http_code}' https://jsr.io/@gadicc/yahoo-finance2/doc/modules/insights` | `200` |
| Checklist verification | see Step 3 | — |

## Scope

**In scope**:
- `README.md` (lines 14–17 rewrite; line 86 typo)
- `CONTRIBUTING.md` (clone URL; v3 language; replace the stale trailing section)
- `docs/README.md` ("Common Options" section)
- `docs/UPGRADING.md` (the XXX TODO sentence)

**Out of scope** (do NOT touch):
- Any code file. This plan is text-only.
- `docs/cli.md`, `docs/mcp.md`, `docs/validation.md`, `docs/concurrency.md` —
  reviewed content, current enough.
- Creating `docs/modules/` per-module docs — deliberate non-goal; module docs
  live on JSR now.
- The "XXX TODO helper APIs" *feature* — plan 010's territory is features;
  here we only remove the placeholder text (see Step 5).

## Git workflow

- Branch from `dev`: `advisor/008-docs-refresh`
- Conventional commit, e.g. `docs: remove stale pre-v3 language and fix broken links`
  (README-only changes have used `[skip ci]` in this repo's history — fine to add).
  Per `AGENTS.md`, end the commit body with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: README banner and typo

- Rewrite README.md:14-17 to reflect reality, e.g.:

  > You are reading the docs for **v3**, the current major version published as
  > `yahoo-finance2@latest`. For the older **v2 docs**, click
  > [here](https://github.com/gadicc/yahoo-finance2/tree/2.x). Upgrading? See
  > [UPGRADING](./docs/UPGRADING.md).

- Line 86: `moduless` → `modules`.

**Verify**: `grep -n "upcoming" README.md` → no matches;
`grep -n "moduless" README.md` → no matches.

### Step 2: CONTRIBUTING clone URL and v3 language

- Lines 27–28: change clone URL to
  `https://github.com/gadicc/yahoo-finance2.git` and `cd yahoo-finance2`.
- Line 143–144: replace "We're still writing these docs ahead of the official
  v3 release." with "Let us know if anything here could be explained better."
  (keep the surrounding sentence flow intact).

**Verify**: `grep -n "node-yahoo-finance2" CONTRIBUTING.md` → no matches;
`grep -rn "ahead of the official v3" CONTRIBUTING.md` → no matches.

### Step 3: Replace the stale "Adding a new module" checklist

Delete the trailing section from the `# Old Version 2 doc sections still to be
updated:` header (line ~146) to end of file, and replace it with a current
"Adding a new module" section under `## Other`. Before writing it, verify each
claim against the repo (this is the one part requiring care):

1. `ls src/modules/screener.ts src/modules/screener.test.ts` — modules are a
   `.ts` + `.test.ts` pair in `src/modules/`.
2. `grep -n "screener" src/modules/index.ts src/index.ts deno.json` — confirm
   the three wiring points a new module needs (export from `src/modules/index.ts`,
   inclusion via `src/index.ts`'s module list, a `deno.json` `exports` entry).
3. `grep -n "@yf-schema" src/modules/screener.ts` — confirm the schema marker,
   hence the `deno task schema` step.

Write the checklist to match what you verified — roughly:

1. Create `src/modules/myModule.ts` (mark schema interfaces with `@yf-schema`).
2. Run `deno task schema` and commit the generated `myModule.schema.json`.
3. Test in `src/modules/myModule.test.ts` (use `setupCache()` from
   `tests/common.ts`; commit new fixtures under `tests/fixtures/http`).
4. Wire it: `src/modules/index.ts`, `src/index.ts`, and a `deno.json`
   `exports` entry.
5. Document via JSDoc on the module (rendered on JSR) and add it to the README
   module list.

Keep the historic "model example PR" link only if you keep it accurate; it's
fine to drop it.

**Verify**: `grep -n "yarn\|index-common" CONTRIBUTING.md` → no matches;
`grep -c "Old Version 2" CONTRIBUTING.md` → 0.

### Step 4: docs/README.md Common Options

Replace "Coming soon. Briefly:" with a short real section: keep the existing
code skeleton, and add one sentence per option — `devel` (test/fixture cache
control), `fetchOptions` (passed to `fetch()`, e.g. `{ signal }`),
`validateResult` (link to `./validation.md`), and a pointer to
`./concurrency.md` for `queue`. Source the meaning of each from
`src/lib/moduleCommon.ts` / `src/lib/options/options.ts` JSDoc — read them and
paraphrase; do not invent options.

**Verify**: `grep -n "Coming soon" docs/README.md` → no matches.

### Step 5: UPGRADING placeholder

In `docs/UPGRADING.md:48-50`, remove the trailing "XXX TODO helper APIs XXX"
so the paragraph ends cleanly after "...Works great with React Server
Components, `trpc`, etc."

**Verify**: `grep -n "XXX" docs/UPGRADING.md` → no matches.

### Step 6: Format and final check

`deno fmt README.md CONTRIBUTING.md docs/README.md docs/UPGRADING.md`

**Verify**: `deno fmt --check` → exit 0. `deno task test` → unchanged, 0 failed.

## Test plan

Text-only change; the "tests" are the grep gates in each step plus
`deno fmt --check`. The Step 3 checklist claims must each be verified by the
listed command before being written — record the command outputs in your report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "upcoming \*\*v3\*\*\|ahead of the official v3\|moduless\|node-yahoo-finance2\|yarn generateSchema\|index-common" README.md CONTRIBUTING.md docs/` → no matches
- [ ] `grep -n "XXX" docs/UPGRADING.md` → no matches
- [ ] `grep -n "Coming soon" docs/README.md` → no matches
- [ ] `deno fmt --check` exits 0; `deno task test` exits 0
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A Step 3 verification command contradicts the checklist you're about to write
  (e.g. module wiring works differently than described) — report what you
  found instead of guessing at the workflow.
- Reading `src/lib/moduleCommon.ts` / options JSDoc for Step 4 reveals the
  option semantics are unclear or contradictory — write only what's certain
  and list the unclear ones in your report.

## Maintenance notes

- The README banner will go stale again at v4 — it now says "current major
  version" rather than naming dates, which ages better.
- Follow-up explicitly deferred: expanding docs/README.md's module docs beyond
  Common Options, and the "helper APIs" feature the removed XXX marker pointed
  at (see plan 010 and plans/README.md).
