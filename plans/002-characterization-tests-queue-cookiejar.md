# Plan 002: Add characterization tests for Queue and ExtendedCookieJar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- src/lib/queue.ts src/lib/cookieJar.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md (verification gate)
- **Category**: tests
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

`src/lib/queue.ts` (the rate limiter every HTTP request goes through) has **no
test file at all**, and `src/lib/cookieJar.ts` (the cookie wrapper the Yahoo
auth flow depends on) has none either. Both sit under `src/lib/` where every
other non-trivial module has a colocated `.test.ts`. Plan 004 will refactor
module-level shared state that touches the queue and the cookie/crumb flow;
these characterization tests must land first so that refactor has a net.
This plan only *adds* test files — zero production-code changes.

## Current state

- `src/lib/queue.ts` (81 lines, no test file) — a promise queue with
  `concurrency` (default 1) and `interval` (default 0, min ms between job starts).
  Public surface:

  ```ts
  // src/lib/queue.ts:17-33
  export default class Queue {
    concurrency = 1;
    interval = 0;
    _running = 0;
    _queue: Array<Job> = [];
    _lastRun = 0;
    _timer: ReturnType<typeof setTimeout> | null = null;
    constructor(opts: QueueOptions = {}) { ... }
  ```

  ```ts
  // src/lib/queue.ts:75-80
  add(func: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._queue.push({ func, resolve, reject });
      this.checkQueue();
    });
  }
  ```

  `runNext()` (lines 35–51) shifts a job, increments `_running`, runs it, and
  resolves/rejects the caller's promise; `checkQueue()` (lines 53–73) enforces
  `concurrency` and schedules a `setTimeout` when `interval` hasn't elapsed.

- `src/lib/cookieJar.ts` (61 lines, no test file) — `ExtendedCookieJar extends CookieJar`
  (from `tough-cookie`) adding exactly one method:

  ```ts
  // src/lib/cookieJar.ts:35-59
  async setFromSetCookieHeaders(
    setCookieHeader: string | Array<string>,
    url: string,
  ) {
    let cookies;
    if (typeof setCookieHeader === "undefined") {
      // no-op
    } else if (setCookieHeader instanceof Array) {
      cookies = setCookieHeader.map((header) => Cookie.parse(header));
    } else if (typeof setCookieHeader === "string") {
      cookies = [Cookie.parse(setCookieHeader)];
    }
    if (cookies) {
      for (const cookie of cookies) {
        if (cookie instanceof Cookie) {
          await this.setCookie(cookie, url);
        }
      }
    }
  }
  ```

  Note `Cookie.parse()` returns `undefined` for unparseable input, which the
  `instanceof` guard silently skips — that behavior should be pinned by a test.

- **Test conventions in this repo** (match them exactly):
  - Tests are colocated: `src/lib/queue.test.ts`, `src/lib/cookieJar.test.ts`.
  - Import helpers from `tests/common.ts`:
    `import { describe, expect, it } from "../../tests/common.ts";`
    A minimal non-network exemplar to model after is `src/lib/csv2json.test.ts`
    (structure) and `src/lib/notices.test.ts`.
  - `setupCache()` from `tests/common.ts` is only needed for tests that hit
    Yahoo HTTP fixtures. Neither of these test files makes network calls, so
    do NOT call it.
  - The test runner is `deno test` behind the `test` permission set in
    `deno.json` (limited read/write/env/net). Pure in-memory tests run fine
    under it.
  - Fake timers: use `FakeTime` from `@std/testing/time` — the import map in
    `deno.json` already provides `@std/testing`. Example:
    `import { FakeTime } from "@std/testing/time";` then
    `const time = new FakeTime(); try { ...; await time.tickAsync(50); } finally { time.restore(); }`

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| New tests only | `deno task test src/lib/queue.test.ts src/lib/cookieJar.test.ts` | all pass |
| Full suite | `deno task test` | 0 failed (≥ 51 passed; step count grows) |
| Typecheck | `deno task check` | exit 0 (task added by plan 001) |
| Lint/format | `deno lint && deno fmt --check` | exit 0 |

## Scope

**In scope** (create only):
- `src/lib/queue.test.ts`
- `src/lib/cookieJar.test.ts`

**Out of scope** (do NOT touch):
- `src/lib/queue.ts`, `src/lib/cookieJar.ts` — characterization means pinning
  current behavior, not fixing it. If a test reveals a bug, write the test to
  assert the *current* behavior with a `// NB: current behavior — see plans/004` comment,
  and mention it in your report.
- `tests/common.ts`, any fixtures under `tests/`.

## Git workflow

- Branch from `dev`: `advisor/002-queue-cookiejar-tests`
- Conventional commit, e.g. `test(lib): add queue and cookieJar characterization tests`.
  Per `AGENTS.md`, end the commit body with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `src/lib/queue.test.ts`

Cover at least:

1. **Sequential default**: `concurrency` defaults to 1 — add three jobs that
   record start order; assert only one runs at a time (e.g. track a
   `currentlyRunning` counter inside the job, assert it never exceeds 1).
2. **Concurrency bound**: `new Queue({ concurrency: 2 })` with 4 jobs; assert
   max simultaneous = 2 and all 4 resolve with their values.
3. **Rejection propagation**: a job that rejects → `add()`'s promise rejects
   with the same error, and subsequent jobs still run (the `.finally` decrements
   `_running`).
4. **Interval pacing** (use `FakeTime`): `new Queue({ interval: 100 })`, add two
   jobs; after `tickAsync(0)` only the first has started; after `tickAsync(100)`
   the second has.
5. **Constructor option handling**: non-number options are ignored (constructor
   checks `typeof === "number"`).

**Verify**: `deno task test src/lib/queue.test.ts` → all pass.

### Step 2: Write `src/lib/cookieJar.test.ts`

Cover at least, using `const jar = new ExtendedCookieJar()` and
`await jar.getCookies("https://finance.yahoo.com/")` to observe results:

1. **Single string header**: `setFromSetCookieHeaders("A1=v1; Domain=.yahoo.com; Path=/", "https://finance.yahoo.com/")`
   → one cookie with key `A1` retrievable for that URL.
2. **Array of headers**: two headers → two cookies.
3. **Unparseable header is skipped silently**: pass a garbage string; assert no
   throw and no cookie added (pins the `Cookie.parse` → `undefined` → skip path).
4. **undefined is a no-op**: `setFromSetCookieHeaders(undefined as unknown as string, url)`
   resolves without adding cookies.
5. **Domain scoping**: a cookie set for `.yahoo.com` is returned for
   `https://query1.finance.yahoo.com/` but not for `https://example.com/`.

**Verify**: `deno task test src/lib/cookieJar.test.ts` → all pass.

### Step 3: Full verification

Run `deno fmt src/lib/queue.test.ts src/lib/cookieJar.test.ts`, then the full
gate: `deno task test && deno task check && deno lint && deno fmt --check`.

**Verify**: all exit 0; test summary shows 0 failed and two new test files.

## Test plan

This plan *is* the test plan — see Steps 1–2 for the case list. Model file
structure after `src/lib/csv2json.test.ts` (describe block per unit, `it` per case).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `src/lib/queue.test.ts` and `src/lib/cookieJar.test.ts` exist with ≥ 5 cases each
- [ ] `deno task test` exits 0, 0 failed
- [ ] `deno task check`, `deno lint`, `deno fmt --check` all exit 0
- [ ] `git status` shows only the two new test files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any test you believe is correct fails in a way that indicates a real bug in
  `queue.ts`/`cookieJar.ts` that cannot be pinned as "current behavior" (e.g.
  a hang / unresolved promise). Report the failing case; do not patch production code.
- `FakeTime` interacts badly with the queue's `setTimeout` (e.g. deadlock under
  `tickAsync`) after one reasonable restructuring attempt — fall back to real
  timers with small intervals (≤ 25ms) and note it.
- The `test` permission set blocks something these tests need (it shouldn't —
  they're in-memory).

## Maintenance notes

- Plan 004 moves the module-level `_queue` in `yahooFinanceFetch.ts` to
  per-instance state; these queue tests are its safety net — do not delete or
  weaken them during that refactor.
- If cookie handling ever changes (tough-cookie major bump — see plans/README
  "considered" notes on `tough-cookie-file-store`), the domain-scoping case in
  Step 2.5 is the one most likely to catch it.
