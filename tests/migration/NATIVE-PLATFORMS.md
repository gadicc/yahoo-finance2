# Native OS proof preparation (B05 / H05)

The separate [Native platforms workflow](../../.github/workflows/native-platforms.yaml)
prepares actual hosted Linux, macOS and Windows verification. It is manual or
reusable and has no schedule, publisher, secrets, OIDC permission or automatic
fallback. The maintained Tests workflow and its Linux sandbox setup are
unchanged. This preparation is not hosted OS acceptance: both independent
reviews must clear before the parent dispatches it, then every required row
must pass and its artifacts must be inspected.

The explicit x64 runners are `ubuntu-24.04`, `macos-15-intel` and
`windows-2022`. GitHub documents these labels in its
[runner inventory](https://github.com/actions/runner-images/blob/main/README.md).
Every row selects development Bun 1.4.3, Node 22.0.0 and Node 24.21.0. Official
Node release manifests list the Linux/macOS/Windows x64 assets for
[22.0.0](https://nodejs.org/download/release/v22.0.0/SHASUMS256.txt) and
[24.21.0](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt).

Consumer minimums remain unchanged on upstream-supported combinations. Linux
and macOS also exercise exact Bun 1.0.0; native Windows uses an explicit Bun
1.1.0 observation row. The official [1.0 assets](https://github.com/oven-sh/bun/releases/expanded_assets/bun-v1.0.0)
have no Windows binary, while the [1.1 assets](https://github.com/oven-sh/bun/releases/expanded_assets/bun-v1.1.0)
include one. This does not establish a new global Bun minimum or support every
intermediate Windows release. The minimum consumer binary is copied to a
separate temporary location before selecting development Bun, so the second
setup cannot silently replace the first binary under the same pathname.

## Installation and source replay

No dependency cache or node_modules tree is restored. The install phase
requires absent node_modules, checks the toolchain, uses a fresh job-local Bun
download cache and runs `bun install --frozen-lockfile` with normal hooks. The
actual root preinstall log must contain the toolchain invocation and success.
The pinned local Biome must run and report 2.5.15. The installed manifest tree
records package versions, locations, engines, licenses, lifecycle declarations
and optional/native platform selectors. Its inventory count is distinct from
Bun's reported install count. The unchanged lock and existing Bun trust policy
remain authoritative; no ignore-scripts or trust override is introduced.
Registry access is confined to explicit dependency installation commands, not
HTTP test probes. Windows checkout disables autocrlf through per-job Git
configuration environment variables, without changing global Git settings.

The replay phase runs the exact native inventory in parallel, serially and with
coverage. Every inventoried file must report passing tests, zero failures and
zero skips. It retains the printed omitted-tooling list. The portable helper's
path/coverage and frame-decoder controls run separately with a fetch preload;
the helper explicitly selects both tooling test files rather than relying on
the native library inventory to discover them. These are trusted infrastructure
controls, not an expansion of that inventory. Native LCOV must contain existing
regular source files, unique records, nonempty unique mapped physical lines,
safe counters, coherent LF/LH/FNF/FNH totals and the unchanged
runtime/quote/chart/public-enum sentinels. This is
the native library scope, not strict full-suite coverage or branch coverage.
No Codecov upload or production coverage threshold is added here.

The existing native controls actually exercise watch additions/removals,
package/helper edits, controlled cancellation, empty/no-match failures,
timeouts and a delayed descendant survivor marker on each real OS. The
additional process probe runs the real platform cleanup branch. It records
POSIX group SIGTERM or Windows taskkill results and uses a real exited parent
whose descendant retains inherited stdio. A Node 24 parent avoids reliance on
Bun's ordinary orphan policy. POSIX group cleanup must close the pipes; Windows
must settle visibly within the bounded deadline and report cleanup uncertainty
when the original parent has already exited. The probe then explicitly cleans
its known descendant. That expected operational failure is not a Windows
process-tree guarantee or a simulated Windows success.

Public native cancellation uses the already tested portable AbortSignal
control. Windows taskkill is forced termination, not console Ctrl-C delivery.
Actual interactive Ctrl-C/ConPTY or PTY behavior remains a separate manual
platform check; it is not silently counted as covered by these jobs. Unexpected
child failures, timeouts or missing tools stop later phases.

## Real installed consumers and CLIs

The package is built outside the checkout, packed offline with normal hooks,
and installed from its real tarball into a separate consumer directory with
spaces. Consumer dependency installation is the explicit registry-enabled step;
all following runtime probes use the rejecting global-fetch preload and
injected controlled quote responses. They exercise all 28 exports in ESM and
CommonJS, public dates/validation/cookies/MCP behavior, and real consumer
TypeScript checking. There are no live Yahoo calls or fixture captures.

Each explicit Node/Bun runtime hosts its CLI controller and launches the same
explicit binary against installed targets from an outside
working directory, checking version/help, import safety and actual npm/bunx
aliases. npm uses the CLI bundled with the exact Node 24 tool host; bunx uses
the explicit development Bun binary. Alias host selection is disclosed rather
than inferred from the direct-runtime row. The controller requires both a real exit status and stream close; it never
accepts historical close-event null arguments as a zero exit. MCP initialize/tools-list/EOF use
only stdin/stdout. A separate Node 24 controller run fragments the first real
initialize response of every installed MCP session into two stdout events,
100 ms apart, and fails if the adapter does not exercise every session. It
preserves all bytes and the normal unsplit run. After a real protocol exchange,
POSIX also exercises
SIGINT/SIGTERM and expects graceful zero exit. Windows instead exercises actual
forced termination, records the raw code/signal and requires bounded close; it
does not call that cooperative shutdown or console Ctrl-C. Windows exercises USERPROFILE fallback and real npm command
shims; POSIX verifies executable symlinks, 0755 bins and 0600 cookie files.
Windows verifies a stable regular cookie file and preserved bytes, with no
POSIX-mode or ACL privacy claim. The original Unix/socket-denial packed-bin
probe remains unchanged; native probing does not attempt HTTP socket denial.

Portable probe corrections normalize actual filesystem paths before checking
`script/src` and `esm/src` resolution, await historical asynchronous resolution,
and accept either an absolute filesystem resolution or a file URL. Bun 1.0's
`createRequire(import.meta.url)` mishandles encoded spaces; the standard decoded
filename form fixes it. Internal/import-safety probes use relative module
specifiers and real script files rather than newer eval flags. The preserved
minimal standard-package URL negative and decoded-file positive controls
isolate this harness issue. All old-Bun spaced-path export/library/runtime and static CLI checks remain
mandatory; there is no package support qualification or minimum change.

The Bun 1.0 observation explicitly uses `library-static` CLI scope. Additional
installed MCP experiments found two separate limitations: a Node24 parent
triggers Bun1.0 stdin lazyLoadStream/getReader EINVAL at SDK stdio startup,
while the old Bun controller emits premature close(null,null) after SIGTERM
without a real exit within the deadline. The identified owned orphan was
explicitly cleaned. These failed protocol/termination controls are retained
as failures, and are not called successful or retried in another mode. Modern
Node22/24 and development Bun rows keep mandatory full installed MCP controls;
the Windows1.1 observation also keeps full controls pending actual execution.
The legacy MCP support decision remains separate from this bounded preparation.

## Evidence and reproduction

The [preparation receipt](results/native-platforms-preparation.json) identifies
its exact base and owned source/proof hashes. Local Linux execution validates
the driver and its controlled processes. It cannot establish hosted Linux,
macOS or Windows results. Actual OS type/release/architecture, versions, GitHub
SHA/run/attempt/image metadata, command statuses, package hash, native LCOV,
installed package inventory and fixture hashes are retained per job, including
failure logs. Summary status becomes passed only after all three phases pass.
Artifacts contain logs/metadata and validated native LCOV, not node_modules,
fixture payloads, cookies, tarballs or caches.

Run the three phases with pinned development Bun from a clean checkout:

```sh
bun scripts/native-platform.ts install --results /absolute/outside/results --expected-os linux
bun scripts/native-platform.ts replay --results /absolute/outside/results --expected-os linux
bun scripts/native-platform.ts package --results /absolute/outside/results --expected-os linux \
  --node22 /absolute/node22 --node24 /absolute/node24 --npm /absolute/npm-cli.js \
  --minimum-bun /absolute/consumer-bun --minimum-version 1.0.0
```

Use `darwin` or `win32` and actual native paths on those hosts; Windows uses the
explicit 1.1.0 consumer observation version. The workflow preserves the runtime
paths automatically. Its scope is trusted native development: replay store
writes and ordinary fallback fetch are blocked, and fixture paths/bytes are
compared before/after every phase, including failure. Arbitrary test code can
still use other network/filesystem APIs. No native raw-socket sandbox, fixture
write denial for arbitrary code, external hard-kill cleanup or OS-wide process
containment is claimed. Strict Linux CI keeps its separate kernel boundary.

The platform contract remains bounded before and after workflow dispatch:

| Contract | This preparation exercises | Remaining native evidence |
| --- | --- | --- |
| H05 source development | Actual OS install/replay/coverage/watch, AbortSignal cancellation, timeout/descendant/held-stdio controls and fixture parity | Hosted execution/artifact acceptance; real interactive console/PTY behavior |
| G01 CLI | Real installed targets, version/help/import safety, npm/bunx resolution, spaced outside cwd, home selection and observed cookie behavior | Actual native quote command parsing/output with controlled Yahoo responses; ACL privacy review |
| G03 MCP | Modern installed stdio initialize/tools-list/EOF; POSIX cooperative signals or Windows bounded forced termination | Bun1.0 installed stdio/termination gaps; native HTTP listen/transport, interactive signals and persistence after tool calls |
| Strict Linux | Existing guarded workflow/setup and Unix packed probes stay byte-identical | Its separate hosted kernel preflight and combined CI acceptance |

Windows inherited ACL semantics require actual Windows evidence and the later
G06 permission review; regular-file checks do not establish private ACLs. These
gaps do not block reviewing the bounded preparation and first native runner
results, and they do prevent claiming complete H05/G01/G03 acceptance here.

## Review correction: disjoint Windows result volumes

Sol identified that `path.win32.relative` returns an absolute path across
Windows volumes, so the initial starts-with-parent check refused valid outside
results. The shared decision now accepts absolute disjoint directory trees,
including other volumes/shares, while explicitly rejecting the checkout, its
descendants and its ancestors. Case-insensitive Windows comparisons remain
provided by `path.win32.relative`. Actual main-path controls prove refusal
before ownership handling and retention of existing unowned-directory checks.
Canonical-directory and owner-marker checks remain unchanged. Pure win32 path
controls are not an actual Windows filesystem execution claim. The v2 receipt
binds this narrow correction and preserves original whole-pipeline evidence.


## Review corrections: MCP framing and native LCOV accounting

Astra reproduced a valid installed MCP initialize response split at byte 208
of 417. The original controller parsed the unfinished tail and failed before
the second pipe event arrived. The tooling decoder now parses only complete
newline frames and preserves UTF-8 between chunks. Malformed complete JSON,
invalid UTF-8 and an unfinished frame at stream end fail the probe; existing
response deadlines and exit/close cleanup remain in force. Direct controls
cover coalesced messages, every byte split of a Unicode response and malformed
frames. The actual installed Node 24 split run retains all 14 CLI/protocol and
shutdown assertions, and restoring only the old controller reproduces the
original failure. This changes probe tooling, not the production MCP server.

Astra also showed that four SF/end-only sentinel records could satisfy the
original native coverage gate. Every record now needs nonempty unique positive
mapped line numbers, safe nonnegative counts, exact LF/LH line accounting and
safe FNF/FNH totals with hits no greater than found. Physical source bounds
handle CRLF and final newlines without inventing an extra line. Missing or
duplicate totals, malformed or unknown fields, duplicate sources/lines,
unterminated records and noncanonical/escaped source paths fail. Bun 1.4.3 does
not emit individual function or branch fields; this gate does not invent them
or expand the native coverage scope. The preserved actual 74-source Bun LCOV
report passes this validator against byte-identical covered sources. This is
revalidation of that report, not a new full-suite execution claim.

The v3 receipt binds both accepted P2 resolutions, the unchanged v2 cross-drive
correction, new private proofs and original evidence reuse. Actual hosted
macOS/Windows results and the pending Bun consumer-minimum policy are still
separate decisions.
