# Maintained CI core (I01–I04 / E06 preparation)

The Tests workflow preserves `push: dev`, the existing four pull-request event
kinds, reusable/manual entrypoints, and the `tests-*` concurrency namespace.
Release branch authorization, `release-*` concurrency and publisher dependencies
are unchanged. No publishing command is part of this milestone.

Setup uses `.bun-version` (1.4.3), Node 24.21.0 as the tool host, a toolchain
check **before** normal `bun install --frozen-lockfile`, and download-only caches
keyed by OS, architecture, Bun version and both independent lockfiles. It never
restores node_modules or skips lifecycle scripts. The copied Copilot setup is
checked for parity. There is no Deno setup or development execution here.

The explicit `ubuntu-24.04` runner avoids a moving `ubuntu-latest` OS target.
Setup installs Bubblewrap, Python, libseccomp, iproute2 and util-linux, then
executes `python3 scripts/ci.py guard`. The real kernel preflight verifies a new
network namespace, AF_INET/AF_INET6 and io_uring denial, child socket denial,
read-only repository/fixture mounts, writable scratch and cleared capture
settings. Missing tools or denied namespaces stop the job. No sysctl or global
security-policy changes are made. The targeted ephemeral CI exception and its
required before/after controls are documented in [CI AppArmor](CI-APPARMOR.md).
The upstream AppArmor `bwrap-userns-restrict` profile strips child capabilities, which can conflict
with Workers' namespace-local loopback setup; it must not be blindly loaded as
a workaround. Actual GitHub runner behavior remains a required remote proof.

The gate order is Python CI unit controls, Biome formatting and lint, complete
TypeScript checking plus negative controls, no-write stale-schema checking,
release-note compatibility, full strict replay with coverage, then LCOV
validation. CI invokes `bun run test:coverage -- --run-timeout 300000` to bound
the complete guarded suite at five minutes under constrained scheduling. Three
compiler/subprocess integration tests have explicit 30-second outer budgets;
the timeout-control test retains its inner 20ms per-test and 100ms whole-run
failures. Ordinary launcher defaults remain 5000ms per test and 120000ms per
run. These budgets do not alter replay isolation or fixture protections.
Jobs use read-only contents and checkout credentials are not persisted. No gate has continue-on-error. Release already depends on the entire
reusable Tests workflow; an unsuccessful gate prevents its publisher job.
The existing K02 formatting/lint debt remains intentionally failing until its
separate cleanup lands. CI integration does not weaken the recommended preset.

Tests also calls `./.github/workflows/native-platforms.yaml` as an ordinary
unconditional job with only `contents: read` and no inherited secrets. The
callee must be integrated in the same commit: GitHub resolves this local
reusable reference from the caller's commit. Its Linux, macOS and Windows
matrix participates in the complete Tests result, including Release's existing
reusable Tests dependency. No additional dependency or condition hides a native
matrix failure. The native workflow uses its separate `native-platforms-*`
concurrency namespace with cancellation disabled, alongside `tests-*` and
`release-*`.

The existing Tests dispatch can select an integration branch containing both
workflows before merge. Standalone manual dispatch of the new native workflow
requires that workflow to be present on the default branch. See GitHub's
[local reusable workflow rules](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses)
and [manual dispatch requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
Hosted native results remain required; this caller integration adds no runtime
or installation proof by itself.

Workers use `python3 scripts/ci.py workers --bun ABSOLUTE_BUN --node ABSOLUTE_NODE
--npm ABSOLUTE_NPM_CLI`. Versions must be Bun 1.4.3, Node 24.21.0 and npm 10.9.9.
CI installs that npm tool independently. A private outside 0700 scratch receives
the generated package under the strict guard and only seven canonical harness
files, including `.npmrc`. Normal `npm ci` runs from that scratch harness with
its independent lockfile and install-links setting. A real package copy is
required. Source typechecking runs under the strict guard; kernel controls and
actual workerd tests run through the separate isolated-loopback helper. Any
failed stage stops later stages and temporary output is removed. No root Bun
harness install, Yahoo requests or real fixture writes occur. The documented
[Workers](WORKERS.md) pathname Unix socket/trusted-code limitations and npm10
actual-tree ELSPROBLEMS qualification still apply.

## Native coverage contract

No coverage exclusion patterns or ignore directives were introduced. Bun's
native loaded-file scope retains production code, CLIs, loaded tooling and test
helpers. Dependencies and test files are omitted by Bun's normal defaults;
JSON schemas/fixtures are data, generated npm output duplicates source, Workers
has its own runtime test job, and experiment result artifacts are never uploaded.
Runtime exports are required, including the four public enums in
`quoteSummary-iface.ts`. Only the pure type module `moduleCommon.ts` is exempt.
The focused enum tests verify serialized Yahoo wire values and distinct upstream
grade spellings; a default-inventory regression rejects an omitted enum module.
Additional sentinels require
CLI, checker, generator, builder, workflow policy, MCP and shared-schema source.
Unloaded modules/subprocesses are not magically instrumented; this is a loaded
source report, not a claim to cover every file or runtime.

`src/other/quoteCombine.ts` retains its historical `istanbul ignore else`.
Deno lint comments are lint directives, not coverage settings. Disposable native
Bun controls record whether Deno/Istanbul coverage comments affect uncalled
functions and check mapped original TypeScript line numbers. Both uncalled
functions remained in FNF with zero body hits. The untaken ordinary return also
had a positive line count: native line accounting must not be interpreted as
branch or exact statement coverage. Comments are not
translated into broader exclusions. Bun 1.4.3 emits native function totals and
line counts in LCOV but no branch records or named function-location records.
The validator rejects unexpected report fields so an engine/report-format
change requires review. There is no invented branch coverage percentage.

`python3 scripts/ci.py coverage` requires a regular canonical
`coverage/lcov.info`, unique existing repository-relative source paths, original
source line bounds, nonnegative counters, consistent line/function totals,
terminated records and the full-suite required source inventory. It rejects
partial, empty, stale-path, symlink, duplicate, generated/test/fixture/result and
outside-repository reports. Existing launcher regressions prove stale LCOV is
cleared before invalid/empty selections and output stages atomically from
scratch without writable fixture aliases. A failed replay never reaches upload.

There was no mandatory coverage percentage threshold in the previous workflow;
none is invented during an engine migration. Correct scope, valid native
artifacts, complete replay and required source presence are gates. Percentages
must not be compared to the old Deno/V8 or benchmark engines. Python CI controls
have their own unit/kernel checks and are not instrumented by Bun.

Only validated `coverage/lcov.info` becomes the seven-day `bun-lcov` artifact.
Codecov runs in a separate job with `id-token: write`; no repository scripts or
dependency installs run there. Fork and Dependabot PRs retain validated artifacts
but skip OIDC upload. Other runs use OIDC with one explicit file, search disabled,
plugins disabled and native line accounting preserved; missing reports and upload
errors fail. There is no token secret or pull_request_target escape. Actual
artifact transfer/OIDC service behavior still needs a remote test run.

## Verification and remaining gates

The [preparation receipt](results/i01-i04-preparation.json) records the scoped
file hashes, commands, successes, known draft-run failure and pending acceptance.
A disposable copy intentionally changes shared `QuoteBase`, proves no-write
schema failure, regenerates affected quote/options schemas, and verifies the
clean gate plus chart/historical consumers after restoring the source shape.
No real fixtures or production source are edited by that proof.

I01/I02/E06 acceptance still needs independent reviews, K02 cleanup and a final
combined immutable snapshot, followed by the authorized remote manual Tests
smoke. I01's clean platform matrix and H05 are separate from local Linux proof;
The user chose native macOS/Windows replay for trusted development tests, while
CI retains strict guarded Linux replay with its actual kernel prerequisites.
Native development replay implementation is a separate milestone; real native
macOS/Windows development and consumer verification remains required. Native
consumer support is retained, with consumer OS proof tracked in H05. I05/I06 recache and
repair automation and J isolated publication remain separate work. Do not mark
these tracker items complete from this preparation alone.

Upstream references verified 2026-10-16:
[setup-bun version-file input](https://github.com/oven-sh/setup-bun),
[setup-node](https://github.com/actions/setup-node),
[Bun native coverage](https://bun.com/docs/test/code-coverage),
[Codecov v7 inputs/OIDC](https://github.com/codecov/codecov-action),
[artifact upload v7](https://github.com/actions/upload-artifact/releases),
[artifact download v8/hash enforcement](https://github.com/actions/download-artifact/releases),
[Ubuntu runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md),
[AppArmor bwrap profile](https://gitlab.com/apparmor/apparmor/-/blob/master/profiles/apparmor/profiles/extras/bwrap-userns-restrict).

Independent Sol xhigh fix review and Astra xhigh full review cleared this
preparation, including the repaired public enum inventory. Astra independently
ran the normal-hook frozen root install, complete Workers pipeline, ten Python
controls, malformed-report negatives and five failure-stage cleanup controls.
This accepts the implementation preparation only: the final combined gates and
remote Ubuntu/artifact/OIDC behavior remain required before I01–I04 acceptance.
