# Plan 011: Add country-profiled getCrumb fixture capture and replay

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b85717d..HEAD -- tests/common.ts src/lib/getCrumb.geo.test.ts scripts/capture-get-crumb-fixtures.ts scripts/capture-get-crumb-fixtures.test.ts deno.json CONTRIBUTING.md`
> If any existing in-scope file changed since this plan was written, compare
> the "Current state" excerpts against the live code before proceeding. On a
> material mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (plan 002's cookie-jar characterization tests are
  already DONE)
- **Category**: tests / dx
- **Planned at**: commit `b85717d`, 2026-08-08
- **Implementation state**: capture/replay tooling implemented and verified;
  one operator-verified VPN profile still needs to be captured and registered.

## Why this matters

Yahoo's initial finance-page, consent, cookie, and crumb responses vary by
request geography. The current fixtures use one shared set of hard-coded cache
IDs, so recording through a VPN would overwrite the default flow. The repo also
contains an old, disabled UK/VPN experiment, which demonstrates the need but is
not a maintainable or complete test matrix.

Add a test-only fixture namespace and a one-command capture driver. Each capture
must use a fresh, dated profile such as `gb-20260808`, record all internal
getCrumb requests without deleting or renaming existing fixtures, compact the
responses to the data `_getCrumb` actually consumes, and immediately prove the
new fixtures replay. Committed geographic profiles must always run in
`replay` mode, including during the generic `FETCH_DEVEL=recache` workflow, so a
US GitHub runner cannot silently replace a UK/EU fixture set.

The country is capture provenance, not a claim that Yahoo has one permanent
response per country. The behavioral contract is the normalized request trace
(direct flow, consent flow, or a future variant) plus successful cookie/crumb
state.

## Current state

- `src/lib/getCrumb.ts` is production code and is **not** to be modified. It
  assigns a separate `devel.id` to each request in the state machine:

  ```ts
  // src/lib/getCrumb.ts:60-65
  develOverride: Partial<YahooFinanceFetchModuleOptions["devel"]> = {
    id: "getCrumb-quote-AAPL",
    onFinish: undefined,
  },

  // Further fixed IDs occur at lines 145, 167, 205, 249, 293/306, and 392:
  // getCrumb-quote-AAPL-consent.html
  // getCrumb-quote-AAPL-collectConsent.html
  // getCrumb-quote-AAPL-collectConsentSubmit
  // getCrumb-quote-AAPL-copyConsent
  // getCrumb-quote-AAPL-consent-final-redirect.html
  // getCrumb-getcrumb
  ```

  A test-layer ID transform can namespace every one of these IDs without
  introducing a geography concept into the library.

- `tests/common.ts:156-215` exposes `fetchDevel()` and selects a
  fetch-mock-cache one-shot policy from each request's `devel.id`:

  ```ts
  export function fetchDevel() {
    function fetchDevel(input, init) {
      const { devel, ..._init } = init || {};
      if (typeof devel === "string") {
        fetchCache.once({ id: devel.replace(/\.json$/, "") });
      } else if (typeof devel === "object" && "id" in devel) {
        // nocache / recache / ordinary auto-mode branches
        fetchCache.once({ id: devel.id });
      }
      return fetch(input, init);
    }
    return fetchDevel;
  }
  ```

  It has no per-caller ID transform or explicit record/replay mode today.

- `tests/fetchCache.ts:12-22` creates one file-system-backed cache. The store's
  default location is `tests/fixtures/http`. Response `Set-Cookie` headers are
  intentionally retained so replay can rebuild an anonymous Yahoo cookie jar;
  sensitive request headers remain under the dependency's default redaction.

- `src/lib/getCrumb.test.ts:15-160` runs the current fixture flow. Lines
  138-160 contain a disabled `VPN-UK` test, and
  `tests/http/getCrumb-quote-AAPL-pre-consent-VPN-UK.json` is an old, partial
  fixture in the legacy fixture directory. Do not revive or build on it: it
  does not cover the complete current flow and the active store now writes to
  `tests/fixtures/http`.

- The current active fixture set includes
  `tests/fixtures/http/getCrumb-quote-AAPL.json` and
  `tests/fixtures/http/getCrumb-getcrumb.json`, plus consent-step fixtures. The
  initial/final finance HTML can be about 1.8 MB even though `_getCrumb` never
  reads it. `_getCrumb` only consumes:
  - response status for `/v1/test/getcrumb`;
  - `Location` headers during redirects;
  - `Set-Cookie` headers to rebuild the jar;
  - hidden `<input>` elements in the collect-consent page;
  - the text body returned by `/v1/test/getcrumb`.

- `deno.json:22-41` grants tests read/write access to active fixtures and
  access to named `FETCH_DEVEL*` variables. `deno.json:15-17` defines targeted
  and serial test tasks. Add the two profile-capture environment variables to
  the explicit allowlist; do not broaden env access.

- `.github/workflows/recache-yahoo-fixtures.yaml:102-122` runs the entire suite
  from its own geography with `FETCH_DEVEL=recache`. Country fixtures therefore
  need a per-test explicit `replay` policy that takes precedence over this
  ambient recache mode. The workflow itself should not need changes.

- Repository conventions:
  - Deno-first TypeScript, with `.ts` extensions on local imports.
  - Tests live beside the source they cover and import BDD helpers from
    `tests/common.ts`.
  - HTTP tests call `setupCache()` and use a fresh `ExtendedCookieJar` when
    isolation matters.
  - Conventional commit subjects use scopes, e.g.
    `test(getCrumb): add country-profiled fixture capture`.
  - Generated `npm/` output is not changed for test-infrastructure work.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Existing baseline | `deno task test src/lib/getCrumb.test.ts src/lib/cookieJar.test.ts` | 2 files pass; 0 failed |
| Capture-tool unit tests | `deno task test scripts/capture-get-crumb-fixtures.test.ts` | all pass; no network |
| Geo replay tests | `deno task test:serial src/lib/getCrumb.geo.test.ts` | every committed profile passes from cache |
| Full suite | `deno task test` | 0 failed |
| Typecheck | `deno task check` | exit 0, no errors |
| Lint/format | `deno lint` and `deno fmt --check` | both exit 0 |
| Manual capture | `deno task fixtures:capture:getcrumb --country <CC>` | record, compact, and replay succeed; VPN/network required |

The existing cookie/getCrumb baseline was green when this plan was written: 2
test files, 16 steps, 0 failed.

## Scope

**In scope** (the only source/config/docs files to modify):

- `tests/common.ts` — optional test-fetch ID transform and explicit cache mode.
- `src/lib/getCrumb.geo.test.ts` — create; profile replay/capture harness.
- `scripts/capture-get-crumb-fixtures.ts` — create; safe capture and compaction
  driver.
- `scripts/capture-get-crumb-fixtures.test.ts` — create; pure helper tests.
- `deno.json` — one task and two narrowly allowed env variable names.
- `CONTRIBUTING.md` — geographic fixture capture/review instructions.
- `tests/fixtures/http/getCrumb-geo-<profile>-*.json` — new generated profile
  fixtures only.
- `plans/README.md` — status update at completion.

**Out of scope** (do NOT touch):

- `src/lib/getCrumb.ts`, `src/lib/cookieJar.ts`, `src/lib/yahooFinanceFetch.ts`,
  or any other production behavior/API.
- Existing `tests/fixtures/http/getCrumb-*.json` baseline fixtures.
- Legacy `tests/http/` fixtures, including the old UK experiment.
- Generic fixture-recache workflow behavior.
- `npm/`, schemas, dependency versions, or a new HTTP mocking library.
- Starting, configuring, or verifying the operator's VPN. The operator must
  establish and verify the exit country before invoking capture.
- Automatically editing the committed profile table from the capture script.
  Registration remains a deliberate review step.

## Git workflow

- Branch from `dev`: `codex/011-country-getcrumb-fixtures`.
- Suggested commits:
  1. `test(getCrumb): add profiled fixture replay harness`
  2. `chore(fixtures): capture getCrumb flow from <CC>`
  3. `docs(tests): document geographic fixture capture`
- Follow `AGENTS.md` for the required `Co-authored-by:` commit trailer.
- Do not push or open a PR unless the operator asks.

## Steps

### Step 1: Add a test-only ID/mode seam to `fetchDevel`

In `tests/common.ts`, add a small options type and keep no-argument behavior
fully backward compatible:

```ts
interface FetchDevelOptions {
  idTransform?: (id: string) => string;
  mode?: "record" | "replay";
}

export function fetchDevel(options: FetchDevelOptions = {}) {
  // existing returned fetchDevel function
}
```

For both supported `devel` forms (string and `{ id, ... }`):

1. Obtain the existing/raw ID exactly as today (including removal of a final
   `.json` in the string form).
2. Compute `cacheId = options.idTransform?.(rawId) ?? rawId`.
3. If `options.mode` is set, call
   `fetchCache.once({ id: cacheId, mode: options.mode })` and bypass the
   ambient `FETCH_DEVEL=nocache|recache` branches for that call.
4. If `options.mode` is absent, preserve every current nocache, recache,
   `.static`/`.fake`, `onFinish`, and fallback behavior, substituting only
   `cacheId` for the ID passed to `fetchCache.once`.
5. Continue to pass the original `init` to the underlying fetch. Do not put
   profile or cache-mode data into production request headers/options.

Explicit per-helper mode precedence is load-bearing: committed country tests
will request `replay`, which must remain replay even when the generic recache
workflow sets `FETCH_DEVEL=recache`. The capture harness will explicitly
request `record` in a targeted serial test process.

**Verify**:
`deno task test src/lib/getCrumb.test.ts src/lib/cookieJar.test.ts`
→ the unchanged baseline passes with the same fixture IDs and no fixture diff.

### Step 2: Create the geographic characterization test

Create `src/lib/getCrumb.geo.test.ts`, modeled on
`src/lib/getCrumb.test.ts:15-35`:

- Import `describe`, `expect`, `fetchDevel`, `it`, `setupCache`, `spy`, and
  `spyLogger` from `../../tests/common.ts`.
- Import `_getCrumb` from `./getCrumb.ts` and `ExtendedCookieJar` from
  `./cookieJar.ts`.
- Call `setupCache()` once in the top-level suite.
- Define a `GeoProfile` with:
  - `profile`: lowercase, append-only identifier such as `gb-20260808`;
  - `countryCode`: the operator-claimed ISO alpha-2 exit country;
  - `capturedAt`: ISO date;
  - `expectedTrace`: an ordered array of normalized
    `{ method, host, path }` entries.
- Keep committed profiles in an explicit table in this file. This makes fixture
  provenance and expected branch behavior reviewable in the same diff.

Add two narrowly named capture controls:

- `FETCH_DEVEL_GETCRUMB_PROFILE` — dynamic profile selected only by the capture
  driver;
- `FETCH_DEVEL_GETCRUMB_MODE` — must be exactly `record` or `replay` whenever a
  dynamic profile is present.

Validate dynamic and committed profile IDs with
`^[a-z]{2}-[0-9]{8}(?:-[a-z0-9]+)*$`. This makes captures append-only and
avoids path separators/traversal. Reject invalid values before `setupCache`
makes a request.

Namespace each internal ID in the test layer:

```ts
function geoFixtureId(profile: string, id: string): string {
  if (!id.startsWith("getCrumb-")) {
    throw new Error(`Unexpected getCrumb fixture id: ${id}`);
  }
  return `getCrumb-geo-${profile}-${id.slice("getCrumb-".length)}`;
}
```

For each committed profile, create
`spy(fetchDevel({ idTransform, mode: "replay" }))`. For the one dynamic
profile, use the validated dynamic mode. Then:

1. Create a fresh `ExtendedCookieJar`.
2. Call `_getCrumb` with the normal initial ID
   `getCrumb-quote-AAPL`, a fresh test context/onFinish pair, and `noCache=true`.
3. Assert the result is a non-empty string. Do not hard-code the opaque crumb;
   its value has no geographic contract.
4. Assert the jar contains a `crumb` cookie at `http://config.yf2/` whose value
   equals the returned crumb, and contains at least one Yahoo cookie for the
   original finance URL.
5. Normalize the fetch spy's ordered calls to method, hostname, and pathname;
   intentionally omit query strings because GUCE session IDs and gcrumbs are
   volatile.
6. For committed profiles, assert exact equality with `expectedTrace`.
7. For a dynamic profile, print one machine-identifiable line only:
   `GET_CRUMB_TRACE=<json>`. The capture driver will show this as the proposed
   registration trace.

Do not assert "country behavior" from the country code. Assert the observed
state-machine route recorded in `expectedTrace`.

**Verify**:
`deno task test:serial src/lib/getCrumb.geo.test.ts`
→ all already registered profiles replay; a missing fixture throws before a
network request instead of auto-recording from the developer/CI country.

### Step 3: Add the safe capture/compaction driver

Create `scripts/capture-get-crumb-fixtures.ts` with `if (import.meta.main)` so
its pure helpers can be unit-tested. Add this task to `deno.json`:

```json
"fixtures:capture:getcrumb": "deno run -A scripts/capture-get-crumb-fixtures.ts"
```

The driver must:

1. Accept required `--country <ISO-alpha-2>` and optional `--profile <id>`.
   Default the profile to lowercased country plus UTC date, e.g.
   `gb-20260808`. Print usage for `--help`.
2. Validate the country and profile before doing any filesystem or network
   work. Reject path separators, uppercase profile IDs, or malformed dates.
3. Refuse to run if any
   `tests/fixtures/http/getCrumb-geo-<profile>-*.json` already exists. Never
   delete/rename an existing profile and do not add `--force`; use a new dated
   or suffixed profile so variants remain reproducible.
4. Print a clear reminder that the operator, not the script, is responsible for
   connecting to and verifying the requested VPN country.
5. Spawn exactly the targeted serial test with the dynamic profile and
   `record` mode. Do not set global `FETCH_DEVEL=recache`, and do not run the
   full suite against the VPN.
6. Require exit 0, a `GET_CRUMB_TRACE=` line, at least the namespaced initial
   page fixture, and a namespaced `getcrumb` fixture. On failure, report the
   newly created paths and stop; do not register the profile.
7. Parse and validate every newly created JSON fixture in memory before
   rewriting any of them. Then compact only those namespaced files:
   - unconditionally remove sensitive request headers (`cookie`,
     `authorization`, `proxy-authorization`, `x-api-key`) if present, without
     printing their values;
   - retain response status fields and only the response headers required for
     replay/debugging: `location`, `set-cookie`, and `content-type`;
   - retain the text body of the namespaced `getcrumb` fixture;
   - for the exact `-collectConsent.html.json` step, extract and retain only the
     hidden `<input type="hidden" name="..." value="...">` tags consumed by
     `src/lib/getCrumb.ts:183-192`; fail compaction if none are found;
   - replace all other response bodies with an empty text body and remove JSON
     or base64 body alternatives.
8. Spawn the same targeted test again with the dynamic profile in `replay`
   mode. This is the proof that compaction retained the whole executable
   contract. If replay fails, stop and leave the files unregistered for manual
   inspection; do not weaken the test.
9. Print the profile metadata and normalized trace as a ready-to-copy
   `GeoProfile` entry, plus the generated file list. Do not edit the test table
   automatically and do not commit.

Add only these two env names to `deno.json`'s test permission allowlist:

```json
"FETCH_DEVEL_GETCRUMB_PROFILE",
"FETCH_DEVEL_GETCRUMB_MODE"
```

Do not grant wildcard env access.

**Verify**:

- `deno task fixtures:capture:getcrumb --help` → usage, exit 0, no files.
- `deno task fixtures:capture:getcrumb --country nope` → non-zero before any
  network request or file creation.
- Unit tests in the next step pass.

### Step 4: Unit-test validation and compaction without Yahoo/VPN

Create `scripts/capture-get-crumb-fixtures.test.ts` and import only exported
pure helpers from the driver. Use in-memory fixture objects; do not touch the
real fixture directory.

Cover at least:

1. valid country/profile normalization;
2. rejection of path traversal, malformed country, malformed date, and an
   already-used prefix (factor filesystem discovery behind a pure/helper seam
   if necessary);
3. fixture ID transformation for every current ID listed in "Current state";
4. compaction preserves status, `location`, `set-cookie`, `content-type`, crumb
   body, and collect-consent hidden inputs;
5. compaction strips irrelevant HTML/body variants and sensitive request
   headers;
6. collect-consent compaction rejects a body without hidden inputs rather than
   producing a broken replay fixture.

**Verify**:
`deno task test scripts/capture-get-crumb-fixtures.test.ts`
→ all pass without network access or changes under `tests/fixtures/http`.

### Step 5: Capture and deliberately register one new country profile

This step requires operator coordination. Before running it, the operator must
choose the country, connect the VPN, and independently verify the exit country.
Then run:

```sh
deno task fixtures:capture:getcrumb --country <CC>
```

Review all generated files before registering them:

- statuses must not be 429, 5xx, a timeout, or an unrelated interstitial;
- redirect hosts must remain within the expected Yahoo hosts;
- `Set-Cookie` data must be anonymous Yahoo consent/session state, not a logged
  in/user-specific session;
- the compacted collect-consent inputs and crumb body must be non-empty where
  required;
- the replay phase must have passed after disconnecting from the VPN is
  possible (re-run it offline/replay-only if practical).

Add the printed `GeoProfile` entry to the committed table in
`src/lib/getCrumb.geo.test.ts`. Run the file normally, with no capture env
variables, to prove the registered profile is replay-only.

If the new country's normalized trace and materially relevant cookie/header
shape are identical to an existing committed profile, do **not** commit a
multi-megabyte duplicate just to label another country. Report that the capture
found no new behavior; either retain only a small provenance note in the test
comment or use a future profile when Yahoo exposes a distinct flow. A new
profile earns its place by covering a different branch or response contract.

**Verify**:

```sh
deno task test:serial src/lib/getCrumb.geo.test.ts
```

→ all committed profiles pass in replay mode with the VPN disconnected; no new
fixture files appear and existing fixtures are unchanged.

### Step 6: Document the repeatable maintainer workflow

In `CONTRIBUTING.md`'s Testing section, add a short "Country-specific getCrumb
fixtures" subsection containing:

- why geography is stored as capture provenance rather than modeled as a
  production option;
- the VPN prerequisite and `deno task fixtures:capture:getcrumb --country CC`
  command;
- append-only dated profiles and the refusal to overwrite old captures;
- the required fixture inspection checks from Step 5;
- the explicit registration step in `src/lib/getCrumb.geo.test.ts`;
- the fact that committed profiles are replay-only and excluded from ordinary
  `FETCH_DEVEL=recache` behavior;
- guidance to skip redundant country captures that do not add a distinct
  branch/shape.

**Verify**:
`deno fmt --check CONTRIBUTING.md`
→ exit 0.

### Step 7: Full verification

Run formatting on only the in-scope TypeScript/Markdown/config files, then:

```sh
deno task test
deno task check
deno lint
deno fmt --check
git status --short
```

Expected: every command exits 0. Git status contains only in-scope files, new
profile fixtures, the pre-existing unrelated worktree state, and the plan index
status update.

## Test plan

- Preserve every existing assertion in `src/lib/getCrumb.test.ts` and
  `src/lib/cookieJar.test.ts` unchanged.
- `scripts/capture-get-crumb-fixtures.test.ts` covers all validation and
  compaction behavior with synthetic data.
- `src/lib/getCrumb.geo.test.ts` is an integration/characterization test for
  each committed geographic flow:
  - exact normalized request sequence;
  - non-empty crumb;
  - crumb persisted in the config cookie jar;
  - at least one Yahoo cookie persisted;
  - replay-only fixture use.
- Manual capture is accepted only after record → compact → replay succeeds.
- Run the generic recache environment once against only the geo test if useful:
  `FETCH_DEVEL=recache deno task test:serial src/lib/getCrumb.geo.test.ts`.
  It must replay without changing country fixtures. Do not run the live full
  recache merely to verify this plan.

## Done criteria

All must hold:

- [ ] `src/lib/getCrumb.ts` and `src/lib/cookieJar.ts` have no diff.
- [ ] Existing cookie/getCrumb tests pass and their fixture paths/content do not
      change.
- [ ] `fetchDevel()` no-argument callers retain current behavior.
- [ ] Country fixture IDs have the form
      `getCrumb-geo-<country-date>-<step>.json`; no manual rename/delete was
      needed.
- [ ] At least one non-redundant new country profile was reviewed, compacted,
      registered, and passes in replay mode, or the operator explicitly accepts
      a BLOCKED result because the VPN capture produced no distinct behavior.
- [ ] A missing country fixture fails replay before network access.
- [ ] `FETCH_DEVEL=recache deno task test:serial src/lib/getCrumb.geo.test.ts`
      produces no fixture diff.
- [ ] Capture driver help/validation and compaction unit tests pass.
- [ ] `deno task test`, `deno task check`, `deno lint`, and
      `deno fmt --check` exit 0.
- [ ] No files outside Scope are modified, apart from pre-existing unrelated
      worktree state.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back; do not improvise if:

- No operator-selected/verified VPN country is available for Step 5. The
  reusable harness may be completed, but do not claim the plan is DONE.
- Yahoo returns 429, 5xx, a timeout, a bot/consent page the parser cannot
  understand, or redirects outside the expected Yahoo hosts. Do not commit the
  transient capture.
- The request is authenticated or response cookies appear user-specific. Do not
  print or commit them.
- A target profile already exists. Choose a new append-only profile; never
  overwrite it.
- `fetch-mock-cache` record/replay semantics differ from the installed v3.1.0
  API and the targeted test cannot enforce replay without changing production
  code.
- Compacted fixtures fail immediate replay. Keep them unregistered and report
  which required response field/body was missing; do not fall back to silently
  committing huge raw pages without review.
- Implementing the test requires any change to production getCrumb/cookie code,
  the public `devel` interface, or generic recache workflow policy.
- Existing no-argument `fetchDevel()` tests or conditional recache behavior
  regress.

## Maintenance notes

- Add a new dated/suffixed profile when geography exposes a new flow; do not
  continually overwrite one `gb` or `us` fixture set. Old variants are useful
  characterization tests.
- Country metadata records where a response was observed. The trace is the
  actual contract under test, and reviewers should reject assertions that imply
  all users in that country always receive it.
- Keep profile fixtures compact. Initial and final finance HTML bodies are not
  consumed by `_getCrumb`; committing repeated megabytes of them makes reviews
  and recaches noisy without increasing coverage.
- If `_getCrumb` begins consuming a new response field/body in the future,
  update the compactor and its unit tests before capturing another profile.
- The old `tests/http/...VPN-UK.json` fixture is historical evidence only. A
  broader legacy-fixture cleanup should be a separate change.
- Reviewers should scrutinize cache-mode precedence: ambient recache must never
  mutate committed geographic fixtures.
