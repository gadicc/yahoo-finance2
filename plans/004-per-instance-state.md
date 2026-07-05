# Plan 004: Stop sharing crumb, debounce, and queue state across YahooFinance instances

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4a72f..HEAD -- src/lib/getCrumb.ts src/lib/yahooFinanceFetch.ts src/other/quoteCombine.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. Plan 003
> intentionally lands first and modifies `quoteCombine.ts` lines 214–219; that
> specific diff is expected, not drift.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-fix-typecheck-add-ci-gate.md, plans/002-characterization-tests-queue-cookiejar.md, plans/003-quotecombine-resolution-hardening.md
- **Category**: bug / tech-debt
- **Planned at**: commit `8d4a72f`, 2026-07-05

## Why this matters

v3's headline change is the instance-based API: `new YahooFinance(options)`,
each instance with its own cookie jar, logger, and queue options. But three
pieces of state are still module-level globals shared by **every instance in
the process**:

1. **Crumb cache** — `crumb` and `promise` in `getCrumb.ts`. The crumb is
   cryptographically paired with the cookies in a jar. Two instances with
   *different* cookie jars share one crumb: instance B sends instance A's crumb
   with B's cookies → Yahoo rejects with 401 ("Invalid Crumb") or silently
   serves the wrong consent context.
2. **Request queue** — `_queue` in `yahooFinanceFetch.ts`. All instances funnel
   through one queue, and `assertQueueOptions` mutates its
   `concurrency`/`interval` from whichever instance ran last — two instances
   with different queue configs fight, last writer wins.
3. **quoteCombine debounce map** — `slugMap` in `quoteCombine.ts`. Calls from
   different instances with identical query options are merged into one batch
   executed with whichever instance's `this` armed the timer — so one
   instance's cookie jar, fetch options, and logger silently serve another
   instance's requests.

Anyone running multi-tenant (one instance per user session/proxy/region) hits
all three. The fix: key each piece of state off the thing it's semantically
bound to (crumb → cookie jar; queue and debounce map → instance).

## Current state

- `src/lib/getCrumb.ts`:

  ```ts
  // src/lib/getCrumb.ts:15
  let crumb: string | null = null;
  ```
  ```ts
  // src/lib/getCrumb.ts:403-405 (end of _getCrumb success path)
    promise = null;
    return crumb;
  }
  ```
  ```ts
  // src/lib/getCrumb.ts:407
  let promise: Promise<string | null> | null = null;
  ```
  ```ts
  // src/lib/getCrumb.ts:413-417
  export async function getCrumbClear(cookieJar: ExtendedCookieJar) {
    crumb = null;
    promise = null;
    await cookieJar.removeAllCookies();
  }
  ```
  ```ts
  // src/lib/getCrumb.ts:437-446 (default export getCrumb)
    if (!promise) {
      promise = Promise.resolve(
        __getCrumb(cookieJar, fetch, fetchOptionsBase, logger, url),
      ).catch((error) => {
        promise = null;
        throw error;
      });
    }
    return promise;
  ```
  `_getCrumb` reads/writes `crumb` at lines 57, 61, 68, 387, and recurses into
  itself at line 277 (consent flow). Both `_getCrumb` and `getCrumb` already
  take `cookieJar` as their first argument — the natural WeakMap key.

- `src/lib/yahooFinanceFetch.ts`:

  ```ts
  // src/lib/yahooFinanceFetch.ts:56
  const _queue = new Queue();
  ```
  ```ts
  // src/lib/yahooFinanceFetch.ts:108-112
  const queueOverride = (moduleOpts.queue as { _queue?: unknown } | undefined)
    ?._queue;
  const queue = queueOverride instanceof Queue ? queueOverride : _queue;
  // const queue = _queue;
  assertQueueOptions(queue, { ...this._opts.queue, ...moduleOpts.queue });
  ```
  `this` here is the YahooFinance instance (`YahooFinanceFetchThis`), with
  `this._opts.queue` defaulting to `{ concurrency: 4, interval: 0 }` from
  `src/lib/options/defaults.ts`. Note the undocumented `moduleOpts.queue._queue`
  escape hatch (an explicit Queue instance override) — preserve it.

- `src/other/quoteCombine.ts`:

  ```ts
  // src/other/quoteCombine.ts:61
  const slugMap = new Map();
  ```
  Used at lines 161–186 (`slugMap.get(_slug)`, `slugMap.set(...)`) and line 200
  (`slugMap.delete(slug)` inside the debounce timeout). The function is invoked
  with `this: ModuleThis` (the instance).

- **Important sharing nuance**: `src/lib/options/defaults.ts` creates ONE
  default jar at module load (`cookieJar: new ExtendedCookieJar()`), merged into
  every instance's options via `deepMerge`. Verify (Step 1) that instances
  constructed without an explicit `cookieJar` all reference that same jar
  object. If so, keying crumb state by jar preserves today's behavior for
  default-configured instances (they still share a crumb — correctly, since
  they share the jar and its cookies) while isolating instances that pass their
  own jars. That is exactly the semantics we want.

- Existing tests that pin current behavior (your safety net):
  - `src/lib/getCrumb.test.ts` — "only calls getCrumb once" (promise reuse,
    lines 180–209) and "retries after getCrumb attempt rejects" (lines
    211–247). Both use a single jar; they must still pass unchanged.
  - `src/lib/queue.test.ts`, `src/lib/cookieJar.test.ts` — added by plan 002.
  - Full fixture-backed suite: `deno task test` (51 files, ~1340 steps).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `deno task test src/lib/getCrumb.test.ts src/lib/yahooFinanceFetch.test.ts src/other/quoteCombine.test.ts` | all pass |
| Full suite | `deno task test` | 0 failed |
| Typecheck | `deno task check` | exit 0 |
| Lint/format | `deno lint && deno fmt --check` | exit 0 |

## Scope

**In scope**:
- `src/lib/getCrumb.ts`
- `src/lib/yahooFinanceFetch.ts`
- `src/other/quoteCombine.ts`
- `src/lib/getCrumb.test.ts`, `src/lib/yahooFinanceFetch.test.ts`,
  `src/other/quoteCombine.test.ts` (new multi-instance cases)

**Out of scope** (do NOT touch):
- `src/createYahooFinance.ts` — it has a *related* problem
  (`Object.assign(YahooFinance.prototype, modules)` mutates one shared class
  across `createYahooFinance()` calls), but fixing that changes the public
  class identity and is deferred; see plans/README.md.
- `src/lib/options/defaults.ts` — do not stop sharing the default jar; that
  sharing is what keeps default-config behavior identical.
- `src/lib/queue.ts` itself — no changes to Queue internals.

## Git workflow

- Branch from `dev`: `advisor/004-per-instance-state`
- One commit per step is ideal; conventional commits, e.g.
  `fix(getCrumb): scope crumb cache to the cookie jar` /
  `fix(fetch): per-instance request queue` /
  `fix(quoteCombine): per-instance debounce map`.
  Per `AGENTS.md`, end commit bodies with a `Co-authored-by:` line.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the default-jar sharing assumption

Run:

```
deno eval 'import YahooFinance from "./src/index.ts"; const a = new (YahooFinance as any)({suppressNotices:["yahooSurvey"]}), b = new (YahooFinance as any)({suppressNotices:["yahooSurvey"]}); console.log("shared:", a._opts.cookieJar === b._opts.cookieJar);'
```

**Verify**: prints `shared: true`. If it prints `false` (deepMerge clones the
jar), STOP — the WeakMap approach still works but the "default instances share
a crumb" behavior claim in this plan is wrong, and the maintainer should know
`deepMerge` clones class instances (that would be its own bug).

### Step 2: Scope crumb state to the cookie jar (`getCrumb.ts`)

Replace the two module-level variables with a WeakMap keyed by jar:

```ts
interface CrumbState {
  crumb: string | null;
  promise: Promise<string | null> | null;
}
const crumbStates = new WeakMap<ExtendedCookieJar, CrumbState>();
function crumbState(cookieJar: ExtendedCookieJar): CrumbState {
  let state = crumbStates.get(cookieJar);
  if (!state) {
    state = { crumb: null, promise: null };
    crumbStates.set(cookieJar, state);
  }
  return state;
}
```

Then mechanically:
- In `_getCrumb`, first line: `const state = crumbState(cookieJar);` and replace
  every read/write of `crumb` with `state.crumb` (lines 57, 61, 68, 387–394)
  and the `promise = null` at line 403 with `state.promise = null`.
- In `getCrumbClear`, replace `crumb = null; promise = null;` with
  `crumbStates.delete(cookieJar);`.
- In the default-export `getCrumb`, `const state = crumbState(cookieJar);` and
  use `state.promise` for the cache/rearm logic (lines 437–446).
- The `ExtendedCookieJar` import at the top of `getCrumb.ts` is currently
  `import type` — it can stay `import type` since it's only used as a type
  parameter of the WeakMap.
- Delete the now-unused `let crumb` (line 15) and `let promise` (line 407).

Run `deno fmt src/lib/getCrumb.ts`.

**Verify**: `deno task test src/lib/getCrumb.test.ts` → all pass (including
"only calls getCrumb once" and "retries after getCrumb attempt rejects").
`deno task check` → exit 0.

### Step 3: Per-instance queue (`yahooFinanceFetch.ts`)

Replace the module-level `const _queue = new Queue();` (line 56) with a WeakMap
keyed by the instance:

```ts
const queues = new WeakMap<object, Queue>();
function instanceQueue(instance: object): Queue {
  let queue = queues.get(instance);
  if (!queue) {
    queue = new Queue();
    queues.set(instance, queue);
  }
  return queue;
}
```

In the body (lines 108–112), change only the fallback:

```ts
const queue = queueOverride instanceof Queue ? queueOverride : instanceQueue(this);
```

Keep `assertQueueOptions(queue, { ...this._opts.queue, ...moduleOpts.queue });`
exactly as is — it now configures the per-instance queue from that instance's
options on every call, which is the intended semantics.

Run `deno fmt src/lib/yahooFinanceFetch.ts`.

**Verify**: `deno task test src/lib/yahooFinanceFetch.test.ts` → all pass.
`deno task test` (full) → 0 failed.

### Step 4: Per-instance debounce map (`quoteCombine.ts`)

Replace `const slugMap = new Map();` (line 61) with:

```ts
const slugMaps = new WeakMap<object, Map<string, unknown>>();
```

At the top of the main `quoteCombine` function body (after the `typeof symbol`
guard), resolve the per-instance map:

```ts
let slugMap = slugMaps.get(this);
if (!slugMap) {
  slugMap = new Map();
  slugMaps.set(this, slugMap);
}
```

All subsequent `slugMap.get/set/delete` usages (lines 161–200) stay textually
identical because they now refer to the local variable. The `slugMap.delete(slug)`
inside the `setTimeout` closes over the same local — correct per instance.
Type the map's value as the existing entry shape if a type annotation is needed
to satisfy `deno task check` (the current code is untyped `Map`, so `Map<string, any>`
with a `deno-lint-ignore no-explicit-any` matches local style if necessary —
prefer a small `interface Entry { timeout: ReturnType<typeof setTimeout> | null; queryOptionsOverrides: ...; symbols: Map<string, ...> }`
only if it stays simple).

Run `deno fmt src/other/quoteCombine.ts`.

**Verify**: `deno task test src/other/quoteCombine.test.ts` → all pass
(including plan 003's regression test).

### Step 5: Add multi-instance regression tests

1. In `src/other/quoteCombine.test.ts`: two clients (`createTestYahooFinance`
   twice, or two `new Yf()` of the same test class), call `quoteCombine` on
   each with identical options within the debounce window; assert both resolve
   correctly and — key assertion — that the two instances' calls were **not**
   merged into a single quote() batch (e.g. by spying on fixtures/fetch counts
   following the file's existing devel-id pattern; if fetch-count spying is
   impractical with the fixture infra, assert instead on `slugMaps` isolation
   indirectly: instance A's pending state must not be observable via instance B.
   If neither is practical with existing test helpers, a minimal unit assertion
   is acceptable: import nothing new, construct two instances, run combines,
   and assert both get correct results — documenting in a comment that batch
   isolation is covered by the WeakMap keying).
2. In `src/lib/getCrumb.test.ts`: add a case in the `getCrumb` describe block:
   two different jars, stubbed `__getCrumb` (follow the existing `spy(() => "crumb")`
   pattern at lines 180–209); call `getCrumb` once with jar A, once with jar B;
   assert the stub was called **twice** (per-jar promise cache), then call again
   with jar A and assert still twice... note: with the stub, `state.promise`
   for jar A is still set (the real `_getCrumb` normally clears it at success —
   the stub doesn't), so a repeat call with jar A returns the cached promise
   without a third stub call. Assert exactly that: `calls.length === 2`.

**Verify**: `deno task test src/lib/getCrumb.test.ts src/other/quoteCombine.test.ts`
→ all pass, including the new cases. Then full gate:
`deno task test && deno task check && deno lint && deno fmt --check` → all exit 0.

## Test plan

- New cases per Step 5 (multi-jar crumb isolation; multi-instance quoteCombine
  isolation). Model after the existing stub pattern in
  `src/lib/getCrumb.test.ts:180-209` and the existing structure of
  `src/other/quoteCombine.test.ts`.
- Regression net: the entire fixture-backed suite (`deno task test`) exercises
  getCrumb + queue + quoteCombine on every module; 0 failed is mandatory.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "^let crumb" src/lib/getCrumb.ts` → no matches
- [ ] `grep -n "^let promise" src/lib/getCrumb.ts` → no matches
- [ ] `grep -n "^const _queue" src/lib/yahooFinanceFetch.ts` → no matches
- [ ] `grep -n "^const slugMap = new Map" src/other/quoteCombine.ts` → no matches
- [ ] New multi-instance tests exist and pass
- [ ] `deno task test` exits 0, 0 failed
- [ ] `deno task check`, `deno lint`, `deno fmt --check` exit 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 prints `shared: false` (see Step 1 for why).
- After Step 2, any getCrumb test fails in a way that isn't a straightforward
  state-threading mistake — particularly the retry test (its semantics depend
  on the `.catch` rearm; if the WeakMap breaks it, the design needs review, not
  a workaround).
- The full suite shows failures in fixture-backed module tests after Step 3
  (a per-instance queue changing request *ordering* could, in theory, disturb
  recorded fixtures — that would be a design-level finding to report).
- You need to modify `createYahooFinance.ts` or `defaults.ts` to make anything
  pass.

## Maintenance notes

- Semantic change to document in the PR description: instances with **custom
  cookie jars** no longer share a crumb (fix), instances with **default options**
  still do (they share the default jar). Queue limits are now **per instance**;
  a process creating N instances can issue N× the previous global concurrency —
  worth a line in `docs/concurrency.md` if the maintainer wants it (deferred,
  out of scope here).
- Deferred, related: `createYahooFinance()` mutates the shared
  `YahooFinance.prototype` and overwrites `_createOpts` on every call
  (`src/createYahooFinance.ts:206-207`) — two `createYahooFinance()` calls with
  different module sets contaminate each other. Needs an API-design decision
  (per-call subclass). Recorded in plans/README.md.
- Reviewer should scrutinize: every former `crumb`/`promise` reference in
  `getCrumb.ts` now goes through `state.` (a missed one reintroduces global
  state silently — grep the diff).
