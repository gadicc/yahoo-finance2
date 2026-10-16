# Controlled country getCrumb capture (D07)

The Bun entrypoint is `scripts/capture-get-crumb-fixtures.ts`. Inspect it safely
with `bun scripts/capture-get-crumb-fixtures.ts --help`. A future operator capture
requires both explicit controls:

```sh
FETCH_DEVEL=recache bun scripts/capture-get-crumb-fixtures.ts --live \
  --country GB --profile gb-YYYYMMDD-variant
```

Use a real calendar date and a new lower-case profile id matching the country.
Before capture, connect to the intended VPN exit and independently verify its
country. The command records the operator's country label; it does not determine
location or verify a VPN. No geolocation service or new host is introduced.
The maintained root alias is `bun run fixtures:capture:getcrumb`; `--help` is
safe to inspect without capture. Live work still requires both controls above.
Independent Sol xhigh and Astra xhigh reviews cleared the repaired snapshot.
All verification described below uses synthetic transport and disposable fixture
roots, without contacting Yahoo or writing repository fixtures.

The CLI rejects missing values, extra positional arguments, unknown/duplicate
options and invalid country/profile/date combinations. `--run-timeout MS` bounds
each baseline/capture process (default 120000ms); `FETCH_DEVEL_RECACHE_INTERVAL`
sets nonnegative physical request pacing (default 3000ms). Help and preflight do
not contact Yahoo. Existing profile prefixes, including nonregular entries,
are refused before the baseline. There is no public root, transport or guard
bypass option. Invalid arguments/opt-in return 2, capture/baseline/validation
failures return 1, success/help return 0 and handled SIGINT/SIGTERM return 130/143.

Each live attempt first runs the actual generic getCrumb and committed geographic
tests through the reviewed strict replay baseline. Failed, empty or timed-out
baselines prevent recording. The existing baseline function gains only an
export; its environment, process, timeout and guard implementation is unchanged.
Recording then copies current fixture bytes, including earlier local changes,
into a private 0700 staging directory with 0600 files. The geographic test runs
in a fresh native Bun child using the reviewed capture preload, minimal
environment, fixed `--no-env-file` and unchanged Linux readonly/network-denied
helper. The original fixtures remain readonly; private scratch is writable. Child
fetches reach the parent via the
reviewed authenticated Unix broker. Its exact five-host HTTPS policy, physical
pacing, redirect handling, size/time limits, abort handling and 429 latch remain
in force. See [core capture policy](RECACHE.md).

The country flow further limits requests to the existing getCrumb GET routes:
`finance.yahoo.com/quote/AAPL`, `guce.yahoo.com/consent`,
`guce.yahoo.com/copyConsent`, `consent.yahoo.com/v2/collectConsent` and
`query1.finance.yahoo.com/v1/test/getcrumb`; POST is allowed only on the consent
collection route. A changed route requires explicit review. Queries needed by
consent requests travel privately and are omitted from trace metadata. The
parent observes every actual transport request and creates a bounded trace of
only method/host/path. The child's reported trace must contain exactly these
fields, use known tuples and equal the parent's sequence. Arbitrary child JSON,
reporter text and logs cannot establish capture success or a different trace.

Before compaction, the parent validates the entire stage: all prior fixtures
must retain their bytes, new output must be regular unaliased single-link JSON
files in the new profile namespace, ids must match actual getCrumb steps and
request routes, and quote/getcrumb fixtures must exist. The set of new filenames
must exactly match fixture ids observed by the parent broker. Each staged
request's canonical URL and method must have been observed for that id; these
session-bearing correlations stay private. A valid-looking but unobserved step
cannot be added to a profile. Repeated requests may intentionally reuse an id
and overwrite its one file: validation compares distinct ids, rather than
requiring one file per physical request, and accepts only observed requests for
that id. The actual getCrumb flow uses manual redirects; each physical broker
hop must satisfy the country step-id/route policy. Unexpected files,
removals, static/fake ids and existing geographic profiles are refused. Existing
bounded consent recursion step ids remain supported. Captured URLs and response
Location values must use the expected HTTPS routes; invalid/transient statuses
and payloads are rejected. Auth-flow HTML/consent redirects are allowed without
allowing 429/408/5xx or transient API errors.

All fixtures are compacted privately using the original helper semantics:
remove sensitive request headers and irrelevant response headers/bodies, retain
crumb text, and retain only the hidden inputs needed from consent HTML. The
compacted profile must then pass the actual geographic test in strict
`geo-replay` mode. Its trace must equal the recorded trace, no transport may be
used, and replay must leave the stage unchanged. Missing captures, unusable
compaction, failed replay or mutated output prevent any publication. Raw child
output is suppressed; diagnostics never print cookie/crumb/payload/query data.
Only sanitized parent-confirmed metadata is printed for subsequent human review
and manual registration in `COMMITTED_PROFILES`. Registration is not automatic.

After these gates, the reviewed publisher rechecks append-only profile policy,
validates captures and compares original bytes immediately before atomic file
publication. Earlier local fixtures stay intact. Host mutation between compare
and rename, publication I/O failure/host crash and SIGKILL are outside an atomic
multi-file transaction; this command does not promise rollback or graceful
cleanup under those conditions. Ordinary success, failure, timeout and handled
signals close the broker and remove private staging. Compacted fixtures still
contain auth-flow data required for replay and require human review before
commit. Linux-only guard coverage, readonly host/Unix-socket visibility and
trusted operator/code assumptions remain unchanged; this is not a general
hostile-code sandbox or full Deno permission parity.

The original seven pure-helper test leaves retain their assertions. Controlled
CLI subprocess tests use disposable 0700 roots with 0600 copies of existing
getCrumb fixtures and wrapper imports of the actual source tests. Synthetic
simple and consent flows prove record, compact, replay and append-only publish;
negative controls cover arguments/opt-in/preflight, baseline failure, 429/503,
ignored unknown-host redirects, bad compaction, forged/mismatched traces,
missing/extra/aliased output, known-but-unobserved steps, altered unobserved
request queries, failed/mutating replay, SIGTERM and timeout. A repeated-id
positive issues three actual requests, including a distinct URL overwriting the
same quote id, then publishes two files after compacted replay. A
trace-boundary leaf rejects extra fields, wrong methods/hosts/paths, query text
and unbounded/empty metadata. Original generic/geographic tests remain active.
Exact immutable commands, hashes and limitations are in
[the D07 receipt](results/d07-country-capture.json).


Independent Sol review accepted a P2 finding in the first 86-check candidate:
a child could add a structurally valid unused copyConsent fixture that replay
never consumed. The replacement source binds the entire staged filename set
to parent-observed ids and verifies per-id canonical request correlations before
compaction and again before publication. The actual CLI reproduction now refuses
publication. The initial immutable archive and 86-check result remain historical; this receipt
records the repaired source and expanded controls awaiting both re-reviews.
