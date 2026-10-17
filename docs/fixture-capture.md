# Fixtures and controlled capture

Ordinary tests are replay-only. Missing fixtures fail. Do not delete a fixture
or set `FETCH_DEVEL=nocache` to refresh tests. New Yahoo-response tests call
`setupCache()` from `tests/common.ts`. Static, fake and geographic fixtures are
protected from generic recache.

Live capture is separately authorized work. It requires both
`FETCH_DEVEL=recache` and `--live`, after a successful strict replay baseline.
Safe help does not contact Yahoo:

```sh
bun run test:recache --help
bun run fixtures:capture:getcrumb --help
```

For an authorized generic capture:

```sh
FETCH_DEVEL=recache bun --no-env-file scripts/recache-tests.ts --live [TEST_PATH ...]
```

The maintained capture inventory is library/fixture tests: `src/**/*.test.ts`
and top-level `tests/*.test.ts`, including harness controls. Scripts, nested
integration tests, Workers and generated/fixture paths are excluded. Explicit
selections containing unsupported files fail instead of silently narrowing.

The selected strict replay baseline defaults to 300000ms; each serial capture
file defaults to 3600000ms. `--run-timeout MS` overrides both for compatibility.
`--baseline-timeout MS` affects only the baseline and takes precedence regardless
of order. Values are positive integers up to 2147483647ms. The baseline budget
also reaches the inner runner. Capture per-test timeouts use the capture-file
budget. `FETCH_DEVEL_RECACHE_INTERVAL` defaults to 3000ms; 840 distinct requests
need at least 2517 seconds of spacing before transport overhead.

A trusted parent broker performs network requests; child fetch facades use
private Unix IPC. HTTPS is allowed only for `finance.yahoo.com`, `guce.yahoo.com`,
`consent.yahoo.com`, `query1.finance.yahoo.com` and `query2.finance.yahoo.com`,
without URL credentials or alternate ports. Redirect authorities are checked at
every hop; origin changes strip authorization/cookie headers. Physical pacing
covers redirects and concurrent admissions. Size, transport time and redirect
counts are bounded. Fake clocks cannot accelerate transport pacing.

The actual broker 429 latch aborts active/queued requests and stops later files.
Reporter text cannot trigger or clear it. Cancellation and child termination
abort parent fetches. Earlier validated captures remain after a later failure;
there is no automatic retry, rollback, Git staging, commit or push.

Fixtures are copied into private 0700 scratch with 0600 files. The parent validates
successful changes and compares originals immediately before atomic replacement.
It refuses removals, protected IDs, aliases and concurrent local edits. A later
I/O failure can leave earlier captures published; compare/rename is not a hostile
concurrent-filesystem transaction. Ordinary failures, timeouts and handled signals
clean up staging; crashes/SIGKILL cannot promise cleanup.

Capture children get an explicit minimal environment and `--no-env-file`, with
credentials, loader hooks and inherited capture settings removed. Raw child output
is suppressed; fixed statuses and validated counters omit cookies, crumbs, queries
and payloads. The initial operator process, host, broker and code remain trusted.

Capture children explicitly select the Unix-enabled IPC profile, retaining
IP/VSOCK/io_uring denial and datagram-pair restrictions. Common host socket/temp
paths are masked; exact owning checkout/runtime/helper closures and private
scratch are restored across nested launches. The private broker is available
there. Other visible Unix endpoints and operator standard I/O remain trusted;
this profile is not a pathname socket allowlist or general hostile-code sandbox.

## Country getCrumb profiles

For separately authorized capture, first select and independently verify the
intended VPN exit country. The command records the operator's label; it does not
geolocate or validate a VPN.

```sh
FETCH_DEVEL=recache bun --no-env-file scripts/capture-get-crumb-fixtures.ts --live \
  --country GB --profile gb-YYYYMMDD-variant
```

Use a real calendar date and new lower-case country-matching profile. Existing
prefixes are refused before baseline replay. `--run-timeout MS` retains its
120000ms default for each country baseline/capture process, with the shared
baseline helper forwarding that budget. Generic recache defaults do not change
this country policy.

Country capture permits only existing getCrumb GET routes and consent collection
POST. The parent records bounded method/host/path metadata and binds every staged
ID and canonical request to actual observed broker traffic. Prior fixtures stay
unchanged and the new profile is append-only. It compacts sensitive headers and
unneeded HTML/body data privately, then must replay the actual geographic test
with identical trace, no transport and unchanged stage before publication.
Compacted data still needs human review. Add the profile to `COMMITTED_PROFILES`
manually after review; registration is not automatic.

## Review response drift before repair

Inspect HTTP status and payload before changing types. Reject 429, 408, upstream
5xx, timeouts and generic consent/HTML/error envelopes as replacement data.
Country auth-flow HTML has its separate route-aware validation. Stable 404s and
ordinary data containing words such as “Timeout” are not automatically transient.
The validator is `bun scripts/check-recache-rate-limits.ts LOG [CHANGED_FIXTURE ...]`;
it detects rate limits even when no file was written and emits fixed diagnostics.

Model observed new fields as required first. Add optionality only when valid
successful fixtures of the same shape prove omission; distinguish null, empty
objects and arrays. Check older/static/fake fixtures and record representative
filenames. Keep concrete types and observed literal unions, with factual JSDoc
where supported. Never loosen successful-response types for an error response.

Automated repair may change allowed interfaces, append distinct observed plain
strings to existing nongeneric literal-union aliases, and regenerate schemas.
Preserve alias names/modifiers and every prior literal/order/duplicate. Runtime,
assertion or fixture changes and other alias edits need operator review. Continue
independent allowed type/schema fixes while that decision is pending.

Regenerate all affected schemas before retesting, including shared consumers.
Replay focused cached tests, then the required full gate; do not recache as
verification. Inspect generated diffs, Git status and captured bytes/modes before
commit. [Automatic schema repair](schema-repair.md) owns proposal policy,
independent docs/types/replay verification and publication controls.
