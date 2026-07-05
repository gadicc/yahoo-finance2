# Plan 003: Harden quoteCombine result distribution against symbol mismatches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- src/other/quoteCombine.ts src/other/quoteCombine.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md (verification gate)
- **Category**: bug
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

`quoteCombine()` batches many single-symbol calls into one `quote()` request and
then distributes results back by symbol key. The distribution loop indexes the
callback map with the symbol **Yahoo returned**, not the symbol the caller
passed. If Yahoo normalizes a symbol (case, suffix — e.g. caller passes
`aapl`, Yahoo returns `AAPL`), `entry.symbols.get(result.symbol)` is
`undefined`, the `for…of` over it throws inside the `.then()` callback, the
chained `.catch()` fires, and **every pending caller in the batch is rejected**
with a confusing `TypeError` instead of receiving data. One odd symbol poisons
the whole batch.

## Current state

- `src/other/quoteCombine.ts` — the only file with the bug. The distribution
  code inside the debounce `setTimeout`:

  ```ts
  // src/other/quoteCombine.ts:210-234
  thisQuote(symbols, queryOptionsOverrides, {
    ...moduleOptions,
    validateResult: true,
  }).then((results) => {
    for (const result of results) {
      for (const promise of entry.symbols.get(result.symbol)) {   // <- line 215: .get() may be undefined
        promise.resolve(result);
        promise.resolved = true;
      }
    }

    // Check for symbols we asked for and didn't get back,
    // e.g. non-existant symbols (#150)
    for (const [_symbol, promises] of entry.symbols) {
      for (const promise of promises) {
        if (!promise.resolved) {
          promise.resolve(undefined);
        }
      }
    }
  }).catch((error) => {
    for (const symbolPromiseCallbacks of entry.symbols.values()) {
      for (const promise of symbolPromiseCallbacks) promise.reject(error);
    }
  });
  ```

  Facts to rely on:
  - `entry.symbols` is a `Map<string, Array<{resolve, reject, resolved?}>>`
    keyed by the **caller-provided** symbol string (set at line 190–197).
  - The existing "#150" loop (lines 223–229) already resolves `undefined` for
    requested-but-missing symbols, so an unmatched returned symbol should be
    **ignored for distribution purposes** and the requester falls through to
    that loop — that is the intended behavior to implement.
  - The `.catch()` (lines 230–234) may call `reject` on promises already
    resolved earlier in the `.then()` — harmless per Promise semantics, but it
    means a mid-loop throw currently leaves the batch half resolved, half
    rejected. After this fix, a mismatched symbol must not throw at all.

- Existing tests: `src/other/quoteCombine.test.ts` exists and uses
  `createTestYahooFinance` + `setupCache()` from `tests/common.ts` with cached
  HTTP fixtures. Read it before writing tests — new cases must follow its
  patterns (devel ids, fixture usage).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `deno task test src/other/quoteCombine.test.ts` | all pass |
| Full suite | `deno task test` | 0 failed |
| Typecheck | `deno task check` | exit 0 |
| Lint/format | `deno lint && deno fmt --check` | exit 0 |

## Scope

**In scope**:
- `src/other/quoteCombine.ts` (the `.then()` distribution block only)
- `src/other/quoteCombine.test.ts` (add cases)

**Out of scope** (do NOT touch):
- The module-level `slugMap` at `src/other/quoteCombine.ts:61` — plan 004 moves
  it to per-instance state; changing it here creates merge conflicts.
- `src/modules/quote.ts` — do not "fix" symbol normalization upstream.
- The public overload signatures (lines 95–119) — `Promise<Quote>` typing of an
  `undefined` resolution is a known wart; changing the public type surface is a
  semver question for the maintainer, not this plan.

## Git workflow

- Branch from `dev`: `advisor/003-quotecombine-hardening`
- Conventional commit, e.g. `fix(quoteCombine): don't reject whole batch on unmatched result symbol`.
  Per `AGENTS.md`, end the commit body with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the distribution loop

In `src/other/quoteCombine.ts`, change the first loop of the `.then()` callback
(lines 214–219) to:

```ts
for (const result of results) {
  const promises = entry.symbols.get(result.symbol);
  if (!promises) continue; // symbol normalized/renamed by Yahoo; requester resolves undefined below (#150 loop)
  for (const promise of promises) {
    promise.resolve(result);
    promise.resolved = true;
  }
}
```

Run `deno fmt src/other/quoteCombine.ts`.

**Verify**: `deno task test src/other/quoteCombine.test.ts` → all existing tests pass.

### Step 2: Add a regression test

In `src/other/quoteCombine.test.ts`, add a test that exercises the unmatched-symbol
path **without the network**: follow the file's existing pattern for constructing
the client, but stub the underlying quote call. The cleanest hook: call
`quoteCombine` twice (two symbols, same options) with a client whose `quote`
result fixture returns a symbol string differing from one requested symbol.

If the existing test file has no precedent for stubbing `quote`, use this
approach instead — it tests the same code path deterministically:
- Request symbols `["AAPL"]` via the normal fixture-backed path, plus a second
  requested symbol that the fixture response does not contain (the existing
  test file already covers "non-existent symbol resolves undefined" per #150 —
  if so, extend it): assert that a returned-but-unrequested symbol in the
  response does **not** reject the batch and each requester gets its own result
  or `undefined`.

The essential assertions:
1. No caller's promise rejects.
2. The caller whose symbol matched gets its quote object.
3. The caller whose symbol didn't match resolves `undefined`.

**Verify**: `deno task test src/other/quoteCombine.test.ts` → all pass,
including the new case. Temporarily reverting Step 1 (e.g. `git stash push src/other/quoteCombine.ts`)
should make the new test fail — confirm, then unstash.

### Step 3: Full verification

**Verify**: `deno task test && deno task check && deno lint && deno fmt --check` → all exit 0.

## Test plan

See Step 2. Model after the existing `src/other/quoteCombine.test.ts` structure
(`describe`/`it` from `tests/common.ts`, `setupCache()` at describe scope).
The new test must fail on the pre-fix code (verified via stash in Step 2).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "entry.symbols.get(result.symbol)" src/other/quoteCombine.ts` shows the guarded form (assignment to a checked variable, not direct iteration)
- [ ] New regression test exists in `src/other/quoteCombine.test.ts` and passes
- [ ] `deno task test` exits 0, 0 failed
- [ ] `deno task check`, `deno lint`, `deno fmt --check` exit 0
- [ ] `git status` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at lines 210–234 doesn't match the excerpt (plan 004 may have landed
  first and moved things — re-anchor by searching for `promise.resolved = true`
  and apply the same guard; if the logic itself changed, stop).
- Writing the regression test requires modifying `tests/common.ts` or fixture
  infrastructure.
- You find the #150 fallback loop no longer exists — the fix's safety story
  depends on it.

## Maintenance notes

- Resolving `undefined` while typed `Promise<Quote>` is pre-existing and now
  slightly more likely to be observed (normalized symbols resolve `undefined`
  instead of crashing the batch). If the maintainer later wants "normalize and
  match" instead of "resolve undefined", the guard in Step 1 is where the
  lookup would consult a case-insensitive index of requested symbols.
- Plan 004 will move `slugMap` into per-instance state and touches the same
  function — land this plan first (it's smaller and its test protects the other).
