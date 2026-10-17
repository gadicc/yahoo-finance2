# Continuous integration

Tests retains its `dev` push and pull-request policy, reusable/manual entrypoints,
read-only contents and nonpersisted checkout credentials. Release depends on the
entire reusable Tests result, including Workers and the native matrix. No gate
uses continue-on-error. [Workflow policy](workflow-policy.md) owns branch rules.

Setup selects exact Bun 1.4.3 and Node 24.21.0, checks the toolchain before normal
`bun install --frozen-lockfile`, and caches downloads rather than node_modules.
Cache keys include OS, architecture, Bun and both independent lockfiles. Copilot
setup mirrors the maintained setup. Ordinary CI does not execute Deno.

Linux jobs use `ubuntu-24.04`, matching the reviewed disposable-runner AppArmor
provisioner. Setup requires Bubblewrap, Python 3, libseccomp, iproute2 and util-linux,
then runs real guard preflight. Missing tools or denied namespaces stop the job.

The gate set includes Python CI controls, Biome format/lint, full project types
and negative controls, no-write stale schemas, API docs lint, release-note
compatibility, complete replay and validated coverage. Docs lint renders privately
and rejects new diagnostics using the same policy as repair verification.

CI runs `bun run test:coverage -- --full --run-timeout 300000`, followed by
`python3 scripts/ci.py coverage`. The full inventory partitions into ordinary
strict replay and the exact five trusted IPC controls in [testing](testing.md).
Unknown files remain strict; no existing leaf or zero-skip requirement is dropped.
One deadline/cancellation signal spans both batches. Real preflight checks
Unix/IP/VSOCK/io_uring denial, read-only fixtures and child inheritance. The
post-AppArmor nested control uses an explicit trusted IPC supervisor before a
strict leaf, preserving the ordinary strict policy.

The native reusable workflow is an unconditional Tests job with `contents: read`,
no inherited secrets and its own noncancelling concurrency namespace. Linux,
macOS Intel and Windows native results participate in release eligibility.
A local reusable workflow resolves from the caller's commit, so caller and callee
must be integrated together. See [platforms](platforms.md) for exact scope.

## LCOV and uploads

Passing leaves alone do not establish valid complete coverage.
`python3 scripts/ci.py coverage` requires the fresh regular canonical
`coverage/lcov.info`, unique existing source records, physical source-line bounds,
safe counters, consistent totals and the full required-source inventory. It
rejects partial/empty/stale, duplicate, symlinked/noncanonical, outside,
generated, fixture and test reports. Runtime exports, public enums, CLI/MCP and tooling sentinels remain
required; the pure type-only module is exempt.

Each raw Bun batch report is strictly validated, including genuine paired
function totals. Its runtime function inventory can vary, and LCOV lacks function
identities needed for a cross-batch union. Merged LCOV therefore contains only
canonical SF/DA/LF/LH records, with safe line-hit sums and recomputed line totals.
The explicit merged-line validator rejects any function fields. CI reports
aggregate function counts as null/unavailable with a reason, never zero or a
fabricated percentage. Explicit native one-batch coverage keeps genuine Bun
function metrics without requiring Python.

Fresh reports stage privately and publish only after all status, JUnit, executed
leaves, cancellation/deadline and cleanup checks pass. Empty/failed/timed-out or
cancelled runs clear stale and partial artifacts. A filtered batch may have no
instrumented coverage; available current-run records are merged without reviving
old reports. The final required-source inventory remains mandatory. Native lines
are not exact statement/branch execution, and percentages are not comparable to
historical Deno/V8 engines. Root `codecov.yml` retains whole-report auto targets
with zero tolerance and adds library, CLI and tooling project/patch checks. CLI
coverage had no historical baseline; its initial 78.55% floor inherits the old
whole-report requirement rather than the newly observed CLI percentage.

Completeness independently walks maintained `src/`, `bin/` and `scripts/` runtime
sources plus release configuration, rejecting file/directory aliases and omitted
unimported sources. `scripts/coverage-policy.json` lists exact type-only byte hashes
and external Python/entrypoint qualifications. These qualifications describe
instrumentation limits; they do not manufacture hits or assert unrecorded tests.

The strict report remains the seven-day `bun-lcov` artifact. Native install, replay and
package proofs run once each under an explicit bounded Bun test wrapper, retaining
separate raw controller coverage outside repository `coverage/`. The fresh normal-hook install
commands and absent-node_modules precondition stay unchanged; the wrapper uses
only Bun/Node built-ins before installation. Ordinary test discovery does not select the explicit native
spec. All three OS jobs remain release gates; only current-run Linux controller
reports contribute to the union, with raw function-pair validation. Native evidence
is trusted execution and does not replace strict replay.

A separate read-only-contents job requires the entire native matrix and strict
job, validates strict completeness **before** the union, and checks all three native
phases, Linux/Bun identity, frozen metadata, measured source hashes and the current
GitHub checkout/run/attempt. Raw reports are sealed after each Bun process exits,
with byte hashes and explicit install/replay/package roles. Missing, partial,
stale, substituted or mismatched evidence fails. If a failed-job retry reuses
earlier successful native artifacts, their older attempt will be rejected; use
**Re-run all jobs** so the evidence is fresh rather than weakening this check.
The resulting line-only `bun-complete-lcov` artifact retains the complete aggregate
scope; strict-only and combined counts remain distinct in the report.

Codecov consumes only the validated combined artifact and runs in a
separate job with OIDC, one explicit report, search/plugins disabled and errors
fatal. Fork/Dependabot runs keep the validated artifact while skipping OIDC.
No dependency installation or repository script execution runs in that upload job.
Upload acceptance/queueing does not establish later Codecov UI processing or a
passing project/patch policy. Inspect the processed checks separately.

## Ubuntu namespace exception

`scripts/ci_apparmor.py` is solely for disposable GitHub-hosted Ubuntu 24.04
runners. It may load a reviewed fixed per-executable `/usr/bin/bwrap` userns
exception when the exact permission failure is observed. It leaves global
restrictions intact. It refuses unsupported hosts, pre-existing attachments,
privileged callers and untrusted binary/parser paths. Fixed root utilities stage
and hash only the pinned profile; repository code/test commands never run as root.

The profile permits namespace use for Bubblewrap's lineage; it does not confine
workloads or grant host-user-namespace credentials. Effective-label checks detect
conflicting attachments. Before/after controls require unchanged unrelated-user
restriction, expected labels, nested strict guards and zero-capability Workers
workloads. Other failures do not trigger weaker retries. Failed provisioning rolls
back only its own profile; failed removal retains diagnostic input and job failure.
The exception is ephemeral, with no persistent `/etc` profile or global sysctl edit.

## Capture and repair workflows

Recache retains its daily schedule, explicit opt-ins, `dev` policy, noncancelling
concurrency and distinct write jobs. Capture/log validation occurs before staging
and again afterward. NUL-framed working/staged inventories accept only validated
ordinary flat JSON additions/modifications with mode 100644; deletes, mode/type
changes, protected fixtures and unrelated paths fail. Dry-run suppresses publication.

Repair uses fresh pinned trusted dependencies and a separate candidate checkout;
it never installs candidate hooks. Exact executable/configuration closure,
documentation config extends, optional tsdoc metadata, recorded drift ancestry
and fixture parity must match. Trusted AST verification parses proposed changes;
full generation checks shared consumers and rejects non-module output drift.
Formatting, lint, types, docs lint and replay precede any verified bundle/readiness.

All candidate code executes under the strict repair/replay boundary, with
Unix/IP/VSOCK/io_uring denial, closed extra descriptors, masked common socket paths
and exact candidate/trusted-tool closures. Replay uses the already-verified
trusted root's controller, fixed empty test options, clean environment and private
HOME/TMPDIR, with the candidate path supplied only as data. The controller starts
in the trusted root with `--no-env-file`; it establishes the ordinary strict child
before candidate test imports. It replays the complete maintained library tier.
Docs lint precedes replay; successful replay precedes bundling/readiness. Guard
startup failure cannot execute candidate top-level code or create a ready bundle.

A fresh publisher restores only verified source/schema data with trusted AST code,
then checks fresh-dev/absent-branch rules before creating the draft PR. Action
adaptation removes only its pinned global userns-disable step; the exact action
revision, input/output hashes and fixed adaptation are maintained in
`scripts/ci_repair.py`. An action upgrade requires deliberate review.

See [schema repair](schema-repair.md) and its linked security architecture for
WIF, auth-only/dry-run controls, proposal policy and separately authorized hosted
smokes. [Release guidance](RELEASING.md) and the
[publisher contract](../scripts/publisher/README.md) own publication. Local guarded
controls establish neither real hosted authentication nor registry/provenance
acceptance. Final composed-source verification is tracked in
[bun migration](bun-migration.md).
