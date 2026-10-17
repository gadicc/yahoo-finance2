# Recache migration checkpoints

## Fixture validation and version checks (D06, 2026-10-16)

The portable Node filesystem implementation snapshots the bytes present when a
run begins. Comparing two snapshots reports added, removed and updated JSON
fixtures while excluding edits already present at the first snapshot. Traversal
ignores symlink entries and rejects aliased roots. Capture input reads check a
stable regular file, reject leaf/ancestor symlinks, and can require a single
hardlink before publication. These checks detect ordinary concurrent replacement;
they are not a transaction against hostile concurrent host filesystem changes.

Run the migrated validator with
`bun scripts/check-recache-rate-limits.ts LOG [CHANGED_FIXTURE ...]`.
It returns 0 for accepted inputs/help, 2 for invalid arguments, and 1 for unsafe
inputs, rate limits or transient responses. It detects 429 even when no fixture
was written, and rejects 408, 5xx, HTML/consent interstitials, malformed JSON text,
and rate-limit/timeout/upstream-error payloads in immediate API error envelopes.
Stable 404 responses and legitimate data fields such as `Timeout Holdings` are
not treated as transient errors. Diagnostics use fixed reasons and omit input
paths, cookies, crumbs and payload contents. Acceptance does not replace the
required human review of captures and interfaces.

The five existing version test leaves now use controlled registry fetches with
their original version/cache assertions. Fetch and version cache state are
restored after each leaf. They no longer depend on a skipped suite or its two
reported skipped hooks. The recache subprocess leaf remains skipped until C06.

The strict guarded command below passed **13 tests in three files**, with no
skips or failures; the existing Node type checker also passed. All **1,201**
repository fixture contents still match the checkpoint HEAD. Independent Sol
xhigh review found a missing generic-envelope/server-error case; the repaired
validator and expanded regressions passed independent review. Exact receipts
are in [D06 evidence](results/d06-fixture-validation.json).

```sh
bun scripts/test.ts --serial scripts/recache-fixtures.test.ts \
  scripts/check-recache-rate-limits.test.ts src/lib/versions.test.ts
bun run typecheck
```

## Capture orchestration work in progress

D05/C06, D07 and D08 remain open. Draft broker, preload and child support is
not a maintained live command. The intended design keeps the existing strict
replay guard, runs a replay baseline first, and requires explicit live opt-in.
Capture children retain kernel network denial and use a parent-side Unix-socket
fetch broker with exact HTTPS host checks and manual redirects. Captures are
staged privately, validated and published by the parent only after original-byte
checks. Generic recache must protect static/fake/geographic fixtures; country
profiles must be append-only and replay after compaction. None of these draft
contracts is claimed complete by this checkpoint. No live Yahoo verification
or repository fixture capture was performed.

## Core capture candidate (C06/D05/D08, awaiting independent review)

The Bun entrypoint is `scripts/recache-tests.ts`. Its only public live mode is
`FETCH_DEVEL=recache bun scripts/recache-tests.ts --live [TEST PATH ...]`.
Neither the environment variable nor `--live` alone enables capture. Paths use
the maintained library tier: `src/**/*.test.ts` plus
`tests/*.test.ts`. This includes library and fixture/harness tests, rather than
only tests that issue HTTP requests. Scripts, nested integration tests, Workers,
generated output and fixture trees are excluded; explicit selections containing
tooling/integration files, unknown options and empty selections fail.
`FETCH_DEVEL_RECACHE_INTERVAL` defaults to 3000ms. The default whole selected
replay baseline budget is five minutes (300000ms), and each capture file has a
one-hour budget (3600000ms). For example, 840 distinct quoteSummary requests
require at least 2517 seconds of request spacing at the default interval, before
transport and execution time. Both budgets remain finite; unusually slow runs
may need an operator-selected override. `--run-timeout MS` overrides both budgets
for compatibility. `--baseline-timeout MS` overrides only the baseline and takes
precedence regardless of argument order. Both options accept positive integers
up to 2147483647ms. The baseline budget reaches the inner strict runner as well
as its parent deadline; baseline replay retains the ordinary per-test timeout.
Country capture continues to use its existing common `--run-timeout` budget
through the same baseline helper. Each capture child's native per-test timeout
uses its capture-file budget, rather than Bun's unrelated five-second default.
The root `test:recache` script maps to this
entrypoint; `bun run test:recache --help` is safe to inspect. Live use still
requires both `FETCH_DEVEL=recache` and `--live`.
This is a review candidate, not a recommendation to contact Yahoo during offline
verification.

Every attempt first runs the selected files through the maintained replay
launcher. Failed or zero-leaf baselines prevent capture. Each capture file runs
in its own native Bun process through the **unchanged** Linux offline helper.
The original repository stays readonly and IP sockets/io_uring stay denied.
An explicit preload installs a fetch facade before test imports and routes it
over private Unix IPC to a parent broker. That broker permits HTTPS on exactly
`finance.yahoo.com`, `guce.yahoo.com`, `consent.yahoo.com`,
`query1.finance.yahoo.com` and `query2.finance.yahoo.com`, with no credentials in
URLs or alternate ports. Transport requests always use manual redirects;
the broker implements the caller's `manual`, `error` or `follow` policy itself.
It validates every followed authority, limits redirects to 20, rewrites POST on
301/302/303 as appropriate, preserves POST/body on 307/308, and strips cookie
and authorization headers when the origin changes. Request/response sizes and
transport time are bounded. Live default-follow requests therefore cannot use
an unchecked redirect to escape the host policy.

The broker latches HTTP 429 before accepting another request, aborts concurrent
attempts, and stops later files. The real broker latch is the sole rate-limit
authority: reporter titles, stdout/stderr prose and child counter text cannot
trigger an abort. A broker observation allows at most 100ms for final child
counters before forced exit; the latch is also checked at child exit. Broker counters remain authoritative for physical
network attempts (including redirects) when child output is interrupted. Reuse
counters use the last cumulative child snapshot per file, avoiding hook-count
duplication. Files run serially with pacing between files and the existing real
clock logical fetch queue inside a file. A parent-wide monotonic admission queue
also spaces every actual transport start, including redirect hops, concurrent
facade requests and later logical requests. Aborted queued calls keep their
position until preceding reservations settle, and the abort/429 state is checked
again immediately before transport. Fake debounce clocks cannot accelerate it.
Premature closure of the caller's response connection aborts the parent upstream;
normal request-body completion does not. Killed and timed-out native children
therefore cancel active parent fetches as well.

All fixtures begin as current-byte copies in private 0700 directories with
0600 files. The cache store drains deferred `onFinish` writes before its after
hook finishes, and keeps rejected fire-and-forget writes visible as failures.
Parent publication validates successful changed/add captures and compares each
original immediately before atomic replacement. It refuses removals, static,
fake and geographic ids, hardlink/symlink aliases and locally changed originals.
Earlier validated captures remain after a later failed file or 429. There is
no Git staging, commit, push or rollback. The private staging tree and session
artifacts are removed on success, failure, handled SIGINT/SIGTERM and timeout;
SIGKILL/host crashes cannot promise graceful cleanup. Original-compare/rename
is not a transaction against hostile concurrent host filesystem mutation.

Baseline and capture children receive an explicit environment: pinned Bun/system
PATH, controlled TMPDIR, C.UTF-8/UTC, NO_COLOR/TERM and NODE_ENV=test. An absolute
`YF_EXPERIMENT_NODE` may be retained solely to select the existing nonsecret
checker executable; its directory is added after Bun in PATH. Other inherited
settings are dropped, including credentials, Node/Bun loader hooks, LD_PRELOAD,
Python controls, capture/FMC settings and Bun JSC overrides. The preload then
sets only the intended capture controls and removes its private configuration
path from the test environment. The private baseline wrapper, maintained Bun
replay child and capture child use fixed `--no-env-file` flags so cwd dotenv
files cannot reintroduce credentials after filtering. The regression includes
functioning preload and dotenv negative controls and an explicitly flagged Bun
grandchild. Inherited environment filtering propagates to grandchildren; any
trusted code that deliberately starts another Bun runtime must also disable its
automatic dotenv loading when it requires this policy. The initial operator
process can already have loaded environment or dotenv values before the script
starts; this is not a parent-process secret boundary.

Ordinary maintained commands continue to clear inherited `nocache` and recache
settings and remain replay-only. The legacy public nocache command is not
maintained. An **internal-only** nocache session verifies the real fetchDevel/FMC
facade bypasses reads and writes against synthetic data, with unchanged
writable temporary fixture bytes. Static/fake ids force replay even on misses.
It is not a public live diagnostic mode. Controlled replay, nocache and recache
coverage does not authorize live Yahoo verification.

Raw test output is suppressed in capture orchestration, including the baseline;
only validated counters, fixed status messages and change counts are emitted.
Unknown endpoint paths become `/:other`; queries, cookies, crumbs, payloads and
arbitrary upstream errors are not forwarded. Operators can use the maintained
replay command separately to diagnose a failed baseline. The guard still exposes
a readonly host filesystem and host Unix sockets. Trusted repository code, the
initial operator process and host concurrency remain assumptions: this is not
a generalized hostile-code sandbox or a claim of full Deno permission parity
(G06 remains open).

All verification uses synthetic transports and disposable fixture publication
roots, including copied fixtures with wrapper imports of the actual auth,
Yahoo fetch and quoteCombine tests. The real repository publication root is
never passed to capture verification. Country-profile CLI D07 remains a separate
unported stage. Exact commands and source hashes are recorded in
[the reviewed core receipt](results/c06-d05-d08-recache-core.json).

The initial candidate passed **55 guarded focused checks across nine files**:
26 core capture checks, the existing 12 maintained-command checks, 12 auth/geo
checks and five version checks. The existing checker passed; a temporary project
extending the migration config also explicitly checked every one of the 19
owned TypeScript source/test files, including private preload and baseline entrypoints.
All 1,201 repository fixture contents retain the D06 checkpoint hash. No full
suite count is asserted while other tooling work is in progress.

The maintained launcher and capture child also distinguish Bun's self-closing
successful JUnit case from a following skipped case. Real mixed filtered runs
succeed, while empty files, unmatched names and all-skipped files still fail.
The bounded parser correction preserves the nonempty-leaf gate.

Independent Sol/Astra review then found four P2 coverage gaps: redirect hops
bypassed physical pacing, caller cancellation left parent upstream work active,
benign HTTP429 reporter prose could stop a run, and Bun's default five-second
test timeout rejected a valid six-second paced capture. The repaired candidate
adds actual transport-start, queue-cancellation/429, upstream-abort,
killed/timed-out-child, benign-prose and default-3000ms/zero-interval controls.
These checks use synthetic data only. Independent Sol xhigh and Astra xhigh
re-reviews cleared the final source with no remaining actionable findings.
The replacement receipt records the exact immutable proof, rather than treating
the earlier 55 passing checks as proof of the repaired cases.

The repaired immutable candidate on committed `501dbaa` passed **61/61 guarded
focused checks across nine files**, including 32 core capture checks and all
previous maintained-command/auth/geo/version controls. Both the existing checker
and explicit 19-file owned TypeScript project passed. All 1,201 real repository
fixture contents still match the D06 checkpoint. This archive excludes concurrent
checker/Workers drafts; a separate workspace attempt exposed a temporary E02
runtime alias removal, since restored by its owner. No geographic leaf was
excluded to obtain the repaired result. Sol independently reran all 61 checks;
Astra independently ran all 32 core checks and additional adversarial probes.
Both cleared the exact frozen source after confirming the original failures were
repaired. Stable combined inventory and full production acceptance remain later
integration gates.
