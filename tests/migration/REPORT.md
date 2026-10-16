# Bun migration tracker and offline test runner experiment

## Migration rebase checkpoint (2026-10-16)

The nine migration-only commits were replayed from old experiment
`c1479eb2191a71ee162945cb811b6b064d572ca3` onto the complete reviewed Bun base
`bffad3e31b4f8d89bbcab62e27348e143f95eb87`, which includes `dev`
`93bb36d93ee1dbf013b6c9baf5c4a730f7ad8459`. The validated rebased code head is
`d757edc2b6f77ecea05ca7904843a34c5aad0c1e`; no duplicate experiment commit was
applied. The one conflict retained both the updated experiment receipt and this
tracker. Other branch refs/worktrees were not changed.

Current maintained full, serial and coverage commands each pass **1,384 tests
across 48 files**, with eight reported skips (six leaves and two hooks). The
count is the updated 1,329-pass baseline + 20 harness + 9 schema + 12 command +
14 executable tests. The upstream workflow-policy six and schema-repair nine
callbacks match `dev` byte-for-byte and pass together under the existing
adapters; their assertions were not converted again or weakened. Frozen install,
normal/incremental typechecks, the overload negative control, all 13 schema
checks, offline release-note generation and guarded Bun/Node probes pass.

All 1,201 fixture hashes match updated `dev`; the six changed screener captures
are upstream changes, not recaching. All non-test `src` production files and
workflow/release policy files match `dev`. All 13 schemas differ only in their
generated `$comment` lines. Reviewed migration helpers, binaries, test commands
and the schema generator retain their pre-rebase bytes. See the
[checkpoint evidence](results/migration-rebase-checkpoint.json) for recovery,
commit mapping, exact commands and parity receipts.

Before this rebase, C07's `a6b4d15` followup and G's `1af6a59` source phase each
received independent GPT-6.1 Sol xhigh and GPT-6 Astra xhigh clearance. The
checkpoint preserves those scoped reviews; it is not the final L03/L04 gate.
The four-file checkpoint integration also passed independent Sol xhigh review
with no actionable findings. Progress remains **22/71**. JSR distribution and
Deno >=2 consumers are retained.
Current policy permits a Deno binary only in the publishing step and prohibits
Deno development/test/build/format/lint runs. This checkpoint used no Deno
binary. Earlier milestone counts, commit IDs and benchmark
receipts below remain dated history, including the original Bun 1.4.2 timings.

## Rebased experiment baseline (2026-10-16)

The reviewed experiment was rebased onto `dev` at
`93bb36d93ee1dbf013b6c9baf5c4a730f7ad8459`. At that baseline the suite passed
**1,329 leaf tests across 44 discovered files**, including six new workflow-policy
tests and four new schema-repair union tests. The new tests use
this experiment's existing runner and assertion adapters. Offline replay,
coverage, type checking, overload negative control, and network and
fixture-write guard probes pass. All 1,201 fixtures match `dev` and stayed
byte-identical during validation. Existing skips and runner reporting
differences remain as described below. See
[rebase validation](results/rebase-validation.json).

The measurements and inventory below describe the original benchmark commit;
they have not been rerun or relabeled as new performance measurements. Pushes to
these experiment branches no longer start Release or standalone Tests. The
existing reusable CI still uses Deno; validating a future experiment PR in CI
requires a separate runner migration.

## Original benchmark

Measured on 2026-10-16 from `f3a2c4cd0273ece8693dbd1387fcd06daa8b8bb1`. This
compares test execution only. Production library files, schemas, fixtures,
package build/release tools, CI and the default branch implementation are
unchanged.

## Result

All candidates execute the same **1,319 actual passing leaf tests across 43
files**. The existing six skipped leaf tests remain. Bun was the fastest
measured runtime. Vitest has useful watch feedback and a clean Node-based port.
`node:test` works, but gave no full-suite speed advantage over Vitest here. The
comparison is complete. **Bun is selected for a staged migration**, with Biome
for formatting/linting and a new major release; production readiness is tracked
separately below. These measurements establish test execution evidence only.

Times below are wall-clock seconds, including process startup and the offline
launcher, with one unmeasured warmup followed by five measured samples. Test
files use isolation and at most four workers; tests within files remain serial.
Versions: Node 24.21.0, Bun 1.4.2, Deno 2.9.7, Vitest 5.0.3, TypeScript 6.0.3,
tsx 4.23.0, pnpm 10.33.2. This Linux host exposed 24 CPUs. Raw samples, ranges,
commands and machine metadata are in
[results/results.json](results/results.json).

| Workload               |  Deno | Vitest5 | node:test + tsx |   Bun |
| ---------------------- | ----: | ------: | --------------: | ----: |
| Full replay            | 1.428 |   2.370 |           2.482 | 0.483 |
| Focused quote file     | 0.209 |   0.720 |           0.351 | 0.154 |
| Coverage command       | 2.061 |   2.953 |           4.102 | 0.522 |
| Repeated type check    | 0.048 |   1.506 |           1.452 | 1.475 |
| Warm incremental tsc   |     — |   0.871 |           0.734 | 0.752 |
| Persistent queue watch | 0.420 |   0.348 |           0.517 | 0.144 |

Watch medians use three completed reruns after whitespace-only content edits to
`queue.test.ts`; each log contains the initial successful five-test run plus
three successful reruns. Every source byte and original timestamp was restored
afterward. An extra disposable Deno checkout kept these edits away from the
default checkout. Bun ignored timestamp-only touches, so those historical
measurements are separate.

The Deno check cache recognizes an unchanged graph. Default `tsc` reruns a
complete check; the incremental row separately enables its persistent build-info
cache. Neither row measures a changed-source or fully cold type check. Each test
command starts a fresh runner process; persistent watch results are a separate
workload. A combined runtime-plus-typecheck pipeline was not separately sampled.

Coverage commands all passed, but reporting defaults and coverage engines
differ: Deno captured V8 profiles, Node printed built-in coverage, Vitest
generated its normal reports, and Bun generated native coverage. These are
operational costs, not equivalent coverage-quality or percentage comparisons.
Installation, package builds, first-run disk/transform coldness and dependable
process-tree peak memory were not measured. Historical Vitest 4.0.18 data
remains labeled in `results/matrix-vitest4.json`; the current table uses 5.0.3.

## Migration progress

The summary counts acceptance items, not effort or release percentage. Checked
experiment evidence remains useful while its production replacement stays open.
The detailed [checklists and work policy](#staged-migration-checklist) below own
all items; the benchmark results above retain their historical meaning.

| Area                                                             | Status          | Done/total |
| ---------------------------------------------------------------- | --------------- | ---------: |
| [A. Baseline and decision](#migration-a)                         | Complete        |        5/5 |
| [B. Dependencies, configuration and installation](#migration-b)  | In progress     |        4/6 |
| [C. Test runner and harness](#migration-c)                       | In progress     |        6/7 |
| [D. Offline fixtures, recache and capture](#migration-d)         | In progress     |        4/8 |
| [E. Type checking and schema generation](#migration-e)           | In progress     |        3/6 |
| [F. Package build and consumer artifacts](#migration-f)          | Planned         |        0/6 |
| [G. CLI, MCP and runtime I/O](#migration-g)                      | In progress     |        1/6 |
| [H. Supported runtime and platform matrix](#migration-h)         | In progress     |        1/5 |
| [I. CI, coverage and repair automation](#migration-i)            | Planned         |        0/6 |
| [J. Major release and publication](#migration-j)                 | Planned         |        0/5 |
| [K. Biome, documentation and developer experience](#migration-k) | Planned         |        0/6 |
| [L. Production readiness and review](#migration-l)               | Planned         |        0/5 |
| **Overall**                                                      | **In progress** |  **24/71** |

## Current branch toolchain (B01–B02, 2026-10-16)

The migration branch now pins **Bun 1.4.3** for development and root package
management; [its stable release](https://bun.com/blog/bun-v1.4.3) was published
2026-10-10. `.bun-version` owns the exact version and `packageManager` repeats
`bun@1.4.3`; a dependency-free `check:toolchain` command and normal `preinstall`
guard validate the runtime, PATH, pin agreement, package-manager context when
provided, root `bun.lock` presence and competing root locks. Run the explicit
check before installing: lifecycle hooks follow resolution, and frozen mode
alone does not require an existing lockfile. Lifecycle bypasses bypass the
guard.

Bun's text `bun.lock` is the sole root JavaScript dependency lockfile. The
obsolete experimental `pnpm-lock.yaml` is removed. `deno.lock` remains the
transitional lock for still-Deno schema/build/release/tooling; the separate
`tests/cloudflare/package-lock.json` remains owned by that npm harness. All
three retained locks are byte-identical to the previous commit. Dependency
versions/classification and consumer engines are unchanged; B03 remains open.

See
[current bootstrap and upgrade policy](../../CONTRIBUTING.md#bun-migration-branch-bootstrap)
for platform requirements, explicit stable-version upgrades and guarded
commands. [Upstream platform requirements](https://bun.com/docs/installation)
are distinct from verified support: only Linux x64 was exercised here.
Python/libseccomp and Node 24.21.0 remain required for the current offline
harness; D04 and E02 remain open. TypeScript 6.0.3 remains the checker; Bun
1.4.3's new checker is deferred.

[Milestone evidence](results/b01-b02-toolchain.json) records the exact binary,
commands, exit codes, lock hashes and controls. A clean disposable installation
with fresh `node_modules` passed `bun install --frozen-lockfile` with normal
lifecycle defaults; changing TypeScript's manifest version to 6.0.2 failed
frozen installation without changing `bun.lock`. No resolutions were
regenerated. The guard passed offline on 1.4.3 and rejected the unchanged global
1.4.2, a wrong/missing PATH binary, Node runtime, npm context, inconsistent
pins, a missing lock and a competing root lock.

Bun's default lifecycle trust policy is retained, with no explicit trust list or
`--ignore-scripts`. `bun pm untrusted` reported zero untrusted dependencies with
install scripts. The observed `esbuild@0.28.2` postinstall is on Bun's default
allowlist; the installed binary passed its version smoke check. An explicit
`trustedDependencies` list would replace those defaults; see
[lifecycle documentation](https://bun.com/docs/pm/lifecycle). Other platforms
and clean-clone lifecycle coverage remain B05, not a completed installation
matrix.

On selected Bun 1.4.3, the guarded full replay passed **1,319 tests / 43
files**, with the existing eight reported skips, and the Node/DOM TypeScript
check, overload negative control and offline socket/cache/write guard passed.
The new guard also passed an explicit strict JavaScript typecheck. All **1,201
fixtures** remain byte-identical. These are correctness checks; the historical
1.4.2 benchmark measurements above were not rerun or relabeled.

## Dependency ownership (B03, 2026-10-16)

The private root manifest now separates **four runtime dependencies** (cookies,
CLI cookie persistence, MCP SDK and Zod) from **20 development dependencies**
for tests, schemas, compile-time checks and release tools. Existing retained
direct versions are unchanged. Release tools and configured plugins use exact
versions from `deno.lock`; `@types/json-schema` is an explicit development
dependency for the source's type-only schema import. The preset stays at 9.3.1
with writer 8.4.0, and the existing release-note contract passes.

Unused root Vitest, its V8 coverage plugin, tsx and Bun ambient types are
removed. Historical comparison reproduction uses its original candidate graphs;
the separate Workers Vitest 4/npm harness is unchanged. Current source uses
fetch-mock-cache only for tests; the old generated package declaration still
ships it and F03 owns reconciling that declaration against packed artifacts. No
public package exports, binaries, engines or publication metadata changed.

[Dependency/configuration ownership](DEPENDENCIES.md) accounts for every root
dependency, all 29 Deno import keys, 20 tasks, 28 exports and the remaining
permissions, compiler, formatter and publish metadata. Deno/dnt/JSR/std tooling
and release preparation remain transitional, with explicit successor items. The
root manifest stays private; full Deno removal and production packaging are not
completed by B03. This classification supersedes the B01–B02 snapshot.

[Evidence](results/b03-dependencies.json) comes from an isolated archive of
`704d1a5c005b699596a1ae363c652f693a821c74` with only B03's manifest/lock
overlaid, excluding concurrent C03 harness edits. A clean frozen install with
normal lifecycle defaults passed; manifest drift failed without changing the
lock. Guarded replay passed **1,319 tests / 43 files**, with eight existing
reported skips; normal/incremental typechecks, overload negative control,
release-note generation and socket/cache/write guards passed. All **1,201
fixtures**, **13 source schemas**, Deno metadata and Workers manifests/lock
stayed byte-identical. The lock changes are removed comparison tools and added
release tool closure, with retained runtime/test package versions preserved;
B06's broader dependency audit remains open. Parent integration separately
verified the concurrent C03 draft at **1,338 passing tests / 44 files** and a
passing typecheck; that draft is outside this milestone's isolated evidence.

## Dependency audit (B06, 2026-10-16)

A clean normal-hook frozen Linux install passed with the lock unchanged. The
actual installed graph covers 565 unique versions: required peers and declared
Node 24.21.0 engines agree, license metadata is present, and no dependency
install hooks or native/platform packages were found. npm's bundled-version
differences reproduce and match its integrity-pinned official archive.

The [audit](DEPENDENCY-AUDIT.md) records two unpatched development/release-tool
advisories and their repository-controlled input boundaries. Neither package is
in the four runtime dependencies' closure. No dependency update, override,
Deno invocation or publication was performed. Independent Sol xhigh review
cleared the evidence after a citation correction. B06 is complete; B05's OS
installation matrix remains open. Progress is **23/71** at this checkpoint.

## Fixture validation checkpoint (D06, 2026-10-16)

The Node filesystem snapshot and validator ports pass **13 focused tests across
three files** under the unchanged strict replay guard. Real temporary fixture
changes cover added/removed/updated bytes, earlier local-edit exclusion, symlink
aliases and unsafe publication inputs. The Bun CLI rejects 429/408/5xx,
HTML/consent, malformed JSON and transient API error payloads while fixed
messages omit cookies, crumbs and payloads. The five existing version leaves
now run with controlled registry fetches and preserve their original assertions;
their skipped hooks disappear honestly. C06 remains open for the skipped recache
subprocess leaf. [The staged policy](RECACHE.md) and
[machine-readable receipt](results/d06-fixture-validation.json) distinguish this
verified scope from draft capture orchestration. Existing typecheck passes;
all 1,201 fixture contents match the checkpoint HEAD. Independent Sol xhigh
review cleared the source after a generic-envelope/server-error correction.
D06 is complete; D05/D07/D08 remain open. Progress is **24/71**. No full-suite
receipt is claimed during the parallel package-build draft.

## Harness behavior (C03–C05, 2026-10-16)

The maintained harness decision retains native Bun registration/hooks, upstream
Jest assertions, Sinon fake clocks and a bounded function-spy adapter.
[HARNESS.md](HARNESS.md) documents the chosen contracts, regression coverage and
limits; [machine-readable evidence](results/c03-c05-harness.json) records the
commands and outcomes. `onFinish` callbacks are now awaited exactly once per
invocation, all cleanup drains after body/callback failures, and multiple errors
retain their causes. Optional assertion messages survive synchronous and
asynchronous matcher failures. Stub disposal restores original descriptors and
inherited properties. Table names and numeric timeouts have negative controls.

The complete Linux replay now has **1,339 pass, 8 skip, 0 fail / 44 files**: all
original 1,319 passing leaves plus 20 new harness regressions. Isolated serial
execution has the same counts; parallel `--rerun-each=2` gives **2,678 pass, 16
skip, 0 fail**. Typecheck passes. The 1,201 fixture before/after hash manifests
are identical. The intentional versions/recache skip policy remains C06, and
this milestone does not update historical experiment counts.

File globals remain live between native repeated runs, so tests own cleanup. A
guarded watch file-change probe verified two hard restarts with fresh global
fetch/console/sentinel and environment state. Native timeouts do not cancel an
unsettled body or guarantee its finish callbacks; resource disposal/native hooks
remain necessary. Maintained command support is C07, and other OS/offline policy
is D04. These results supersede the experimental lifecycle/message limitations
in the historical adaptation notes below.

The foundation steps through `e06cbbc` also passed an independent GPT-6 Astra
xhigh adversarial review with no unresolved findings. Its checks included
1,339/44 guarded replay, typecheck/release notes, 40 repeated harness runs,
environment isolation and unchanged hashes for all 1,201 fixtures. This is a
review of the completed foundation steps, not the final L03/L04 readiness gate.

## Schema tooling (E04–E05, 2026-10-16)

`bun run schema` and `bun run schema:check` now use Node APIs and root-installed
schema tooling, preserving the custom formatter while removing Deno cache,
`deno info`, lockfile inspection and symlink mutation. Every run regenerates
imported types in memory; unchanged bytes retain output timestamps. The no-write
check rejects stale/missing/invalid schemas, empty default inventories and
orphan outputs. Generation failures preserve every selected output; successful
writes use sibling temporary files and atomic replacement per output. Watch
coalesces edits, retains in-flight changes and closes cleanly on signals.

All **13 schemas** retain exact non-comment bytes and property ordering. Their
only change updates the generated command to `bun run schema` and removes an
unimplemented VSCode automation claim. The generator retains its own bundled
TypeScript 5.9.3 and uses Node ambient types; project checks stay on TypeScript
6.0.3. No dependency versions, interfaces or fixtures changed.

[Schema behavior and limitations](SCHEMAS.md) and
[evidence](results/e04-e05-schema.json) cover clean frozen installation,
full/focused guarded replay, normal/incremental typechecks, custom formatting,
JSON imports, explicit/force modes, unchanged timestamps, watch subprocess and
signal cleanup. A disposable real quote/options shared-type negative control
rejects stale outputs without writing, then regeneration repairs them; the
historical/chart consumer tests pass. **E06 stays unchecked** until I02 routes
and verifies the actual CI gate; its maintained command and controls are ready.

## Maintained replay commands (C07/D03, Linux D04 work, 2026-10-16)

`bun run test`/`test:replay`, `test:focused`, `test:serial`, `test:watch`, and
`test:coverage` now use `scripts/test.ts`. It discovers sorted recursive test
files with explicit exclusions, rejects unknown flags and empty execution,
handles spaced/absolute paths, fixes parallel workers at four, and isolates
serial files. Name/path filtering, whole-run timeouts, signal forwarding and
hard watch restarts (including file additions/removals) have focused controls.
Coverage output is generated in scratch and published atomically; old LCOV is
removed before a new selection so missing coverage cannot expose stale metrics.

Ordinary tests deliberately replace Deno's automatic live fixture capture with
**replay-only** behavior. Inherited capture settings are cleared. The maintained
Linux helper requires Bubblewrap, Python and libseccomp with no fallback. It
uses read-only host/repository mounts, private devices, fresh network/PID
namespaces, and independent IPv4/IPv6/io_uring syscall denial inherited by
children. Writable inherited descriptors above stdio are closed. A fresh
checkout needs no chmod preparation; synthetic writable fixtures, RAM-backed
checkouts, write/delete/chmod attempts and missing-guard controls verify this.
[The command/offline policy](TESTING.md) describes the exact boundary and its
limits. Explicit live recache remains D05. CI adopts this policy through I02;
this milestone does not change workflows. Root integration tests follow replay;
Workers' separate local-emulator/external-network boundary remains H04/I02.
Future live integration tests require explicit opt-in commands, never replay
fallback.

[Isolated milestone evidence](results/c07-d03-linux-guard.json) overlays only
C07's owned files on schema commit `37eaac9`, excluding concurrent CLI drafts.
Full parallel, serial and coverage each pass **1,359 / 46 files**, with eight
reported skips (six leaf tests and two hooks). The total is 1,319 original
passes + 20 harness + 9 schema + 11 command/guard regressions. Focused quote
passes 47 tests; typecheck passes. All 1,201 fixture hashes remain unchanged,
including on the archive's ordinary writable checkout modes. D04 stays open:
Linux is verified; other supported OS choices and CI provisioning remain to be
implemented and verified. Historical experiment measurements are unchanged.

## Executable source phase (G02 and partial G01/G03, 2026-10-16)

Both source executables now use Node APIs for environment, arguments, paths,
filesystem operations, UTF-8 stdin, TTY detection and exit status. A shared
helper provides real-path main guards, exclusive 0600 cookie creation,
descriptor-based mode enforcement and sanitized cookie loading. Imports and
help/version paths require no HOME, cookies or network. CLI usage/runtime
exits, piped JSON, terminal inspection and stderr diagnostics are preserved.
MCP source controls cover token precedence/non-local binding before cookie
access, caught HTTP startup errors and real stdio initialize/tools/list with
EOF/SIGINT/SIGTERM cleanup. Configured token values are redacted from startup
diagnostics, including rejected token-assignment syntax.

[Source executable behavior](EXECUTABLES.md) and
[evidence](results/g01-g03-source-cli.json) record fourteen focused cases,
clean isolated frozen installation, normal/incremental typechecks, an isolated
**1,362 passing tests / 46 files**, stronger read-only/network guarding and a
real Linux PTY-versus-pipe control. Source help/version/import probes pass on
Node 24.21.0 and Node 22.13.0 with the latter's explicit experimental stripping
flag. These optional source modes do not raise published Node 22.0 minimums.
All 1,201 fixture contents remain unchanged. G01/G03 retain pending packed/OS
acceptance; G04–G06 remain open despite useful source controls.

## Retained Deno/JSR consumer policy (H02 decision, 2026-10-16)

The user explicitly chose to **preserve JSR distribution and Deno consumer
compatibility**, retaining the existing **Deno 2.0.0 minimum**. Development,
tests and builds use Bun/Node. A Deno binary is allowed only inside the isolated
publisher, including its publisher-owned compatibility rehearsal. Removing
Deno development tooling does not remove the Deno consumer target.

H02 records this policy decision. It does not claim publisher implementation,
JSR packaging or supported-runtime compatibility checks already pass: J01 and
H03/H05 remain open. Existing `deno.json` metadata and source library semantics
remain in place while F/J establish the publication artifacts and verify
compatibility; the publisher's current locked JSR/Deno dependencies are not an
ordinary development/test/build toolchain.

## What was adapted

- Test-only imports now use a small runner module; source imports remain `.ts`.
  Direct `Deno.test` registrations use each candidate's native runner.
- All candidates retain the same Jest `expect` implementation, a small
  `.calls[].args` spy/stub adapter and Sinon fake timers. No assertions were
  weakened. The optional Deno assertion-message argument is accepted but its
  diagnostic text is not forwarded to Jest.
- Bun needs a zero-argument native test callback because a callback parameter
  means `done`. Its adapter passes `undefined` as the unused project
  test-context value; `onFinish` callbacks retain their existing behavior.
- Bun 1.4.2 returned undefined exports through Jest's ESM wrapper.
  `createRequire` loads the same working CommonJS assertion implementation.
  Native Bun matchers were rejected after six differing assertions; the final
  candidate preserves the shared Jest assertion semantics.
- Cache setup uses fetch-mock-cache 3.1.0's Node/Bun adapters. It requires
  replay mode and a cleared `FETCH_DEVEL`, and the underlying network fetch
  throws.
- Two import aliases for deferred Deno tooling (`walk`, `parseArgs`) throw if
  reached. The tests call only the scripts' pure helpers. Capture/traversal CLI
  execution remains deferred; there is no fake global Deno implementation.
- Type checking includes all source TS, test helpers, runner helpers and
  `scripts/**/*.test.ts`, plus transitively imported files. JavaScript
  dependencies are included with `allowJs`, `checkJs:false`. Cloudflare tests
  are excluded. Deno types remain available for the preserved skipped subprocess
  body. An obsolete hook error directive was removed; MCP result-content arrays
  are explicitly narrowed without changing their existing expectations.

Bun's native ambient types additionally require `fetch.preconnect`, rejecting
many valid standard-fetch mocks. The passing Bun typecheck uses Node/DOM library
types and a narrow local declaration of the runner surface. This is an explicit
limit, not a native-Bun typecheck pass. The following historical reproducer
requires the original Bun experiment dependency graph (including `@types/bun`
1.3.8), rather than the pruned B03 bootstrap:

```sh
python3 tests/migration/offline.py "$YF_EXPERIMENT_NODE" node_modules/typescript/bin/tsc -p tsconfig.bun-native.json
```

`tsconfig.bun-native.json` exists only on the Bun branch. B03 removes the unused
`@types/bun` dependency because the supported checker selects Node/Deno types;
running this historical config on a fresh B03 install reports missing Bun types.
E02 owns resolving or isolating native Bun typing without widening the public
fetch contract.

## Inventory and safety

[inventory.json](results/inventory.json) records every file and its
passed/skipped leaf counts. Deno reports top-level tests and nested steps; its
tree also includes an empty quoteSummary `describe`. Vitest permits that
existing empty suite. Node counts the skipped versions suite without enumerating
its five leaf tests. Bun's JUnit output counts two skipped unnamed hook entries
in that suite, yielding eight reported skips. No passing tests were omitted for
speed.

The original Deno recache subprocess test body is retained but skipped, matching
its baseline permission skip. It still tests Deno orchestration and has not been
ported. Simulated-fetch recache behavior tests execute under every candidate.

All 1,201 fixture contents remained byte-identical. Each candidate's fixtures
were made read-only. Negative probes demonstrate missing-cache rejection with
zero fallback calls, denied fixture creation, and independently denied IPv4/IPv6
socket creation. The Linux libseccomp filter survives child exec. Bun maps
kernel EPERM to ECONNREFUSED; the saved syscall trace independently confirms
IPv4/IPv6 and child socket denial. A raw child-socket self-check makes an
unguarded probe fail even when Bun would otherwise report a closed-port
ECONNREFUSED. Installation happens separately; tests never run with live Yahoo
access. Guard and compile-time negative control results are saved in
`results/verification.json`.

The overload negative control copies `options.type.test.ts` to a temporary test
file, removes its error directives, requires real TypeScript assignment
failures, and removes that copy in `finally`. This verifies that overload checks
are not merely transpiled as an empty runtime test.

## Reproduce the historical experiment

For current `codex/bun-migration` commands, use the
[branch bootstrap](../../CONTRIBUTING.md#bun-migration-branch-bootstrap) with
`bun install --frozen-lockfile` and `bun run` scripts. The pnpm procedure below
belongs to the immutable experiment snapshots, including the
[Bun snapshot at c1479eb](https://github.com/gadicc/yahoo-finance2/tree/c1479eb2191a71ee162945cb811b6b064d572ca3).
It is not an installation procedure for the migration branch, which no longer
has a pnpm lockfile.

Use the corresponding `codex/test-runner-vitest`, `codex/test-runner-node` or
`codex/test-runner-bun` checkout. These experiment manifests deliberately retain
shared tooling dependencies; they are not a minimized final dependency graph.
The Bun branch also carries `bun.lock`. No installation-speed claim is made.

```sh
export YF_EXPERIMENT_NODE=/home/dragon/.nvm/versions/node/v24.21.0/bin/node
pnpm install --frozen-lockfile --ignore-scripts
python3 tests/migration/prepare.py > /tmp/yf-fixture-hashes.json
python3 tests/migration/offline.py "$YF_EXPERIMENT_NODE" tests/migration/guard-probe.mjs
pnpm test:replay
pnpm test:focused
pnpm test:coverage
pnpm typecheck
pnpm typecheck:incremental
python3 tests/migration/negative-typecheck.py
```

Read-only modes are not persisted by Git: `prepare.py` is required after a fresh
checkout. `benchmark.py` performs preparation and negative guards automatically.
Both launchers discover the explicit 43-file inventory instead of relying on
shell `**` expansion. Linux and `libseccomp.so.2` are required for these offline
commands; a missing filter is an error, never a fallback to network-enabled
execution.

```sh
python3 tests/migration/benchmark.py --deno-root /path/to/deno-baseline \
  --vitest-root /path/to/vitest --node-root /path/to/node --bun-root /path/to/bun
python3 tests/migration/watch.py --deno-root /path/to/disposable-deno \
  --vitest-root /path/to/vitest --node-root /path/to/node --bun-root /path/to/bun \
  --content-change
```

Run these sequentially without other timing workloads. Candidate filters and
`--modes typecheck-incremental --candidates vitest node bun` reproduce the
optional incremental variant. A failed benchmark cell is retained and makes the
driver exit nonzero after independent cells finish. Large logs and coverage stay
outside Git.

The Bun migration must cover deferred schema/build/release/CLI tooling and
packed npm compatibility (Node consumers, ESM/CJS, declarations and exports),
beyond this test-runner result. Avoid inferring package-build or production
runtime performance from these replay benchmarks.

## Staged migration checklist

This is the source of truth for the long-lived `codex/bun-migration` branch,
created from `codex/test-runner-bun` at
`c1479eb2191a71ee162945cb811b6b064d572ca3`. The experiment is complete; the
production migration is deliberately incremental and has no deadline or
automatic schedule.
[Issue #1029](https://github.com/gadicc/yahoo-finance2/issues/1029) sets the
direction: remove Deno development tooling, use Bun, adopt Biome, and ship a new
major release. The explicit H02 policy retains JSR distribution and Deno
consumer compatibility (minimum Deno 2.0.0); only the isolated publisher may own
a Deno binary. Implementation and compatibility verification remain J01/H03/H05.

Only the numbered checkbox lines below count toward progress. Each has a stable
ID; do not count headings or explanatory paragraphs as tasks. A checked item
records the stated evidence, not blanket production readiness. Update the table
and totals whenever an item changes; add verification evidence beside newly
completed items. Preserve the experiment's raw results and dated conclusions.

### Work policy and order

Use GPT-6.1 Sol High by default for orchestration, planning and substantive
implementation. Use Medium for bounded mechanical tasks; Terra/Luna can be used
when appropriate for that work. Escalate implementation to xhigh only for
unusually difficult debugging, tangled architecture or when High is demonstrably
struggling. The prescribed reviews are a separate explicit exception: each
meaningful isolated step receives independent GPT-6.1 Sol xhigh review.
Important milestones and the final result also receive GPT-6 Astra xhigh
adversarial review explicitly seeking hidden defects, missed requirements, edge
cases, regressions, security issues and test gaps. Resolve findings and rerun
affected checks before marking the step done. These are branch work
instructions, not global model configuration changes.

Commit meaningful, reviewable steps using Conventional Commits with scope,
motivation and the repository's coauthor trailer. Keep unrelated work and
fixture churn out of each commit. Record evidence, remaining limitations and the
next step here. The tracker does not authorize unrelated changes or schedule
future runs; proceed only within the requested migration work for each session.

Start with dependency decisions B01–B03 and the harness/offline boundary
C03–D04; these establish commands that later tooling can depend on. E (schemas),
F (packaging), and G (executables) then establish production behavior. H and I
validate the supported environments before J's release work and L's final gate.
K's Biome and documentation work can proceed in small independent commits after
B's configuration decisions, with a final command audit after I/J. Follow
explicit cross-references when work crosses these areas.

**Next small milestones:** port recache subprocess checks and resolve skip
policy (C06/D05), and finish the portable offline policy (D04). B04 can
independently port import resolution and real traversal/CLI helpers using B03's
ownership map; E02–E03 can establish production checker configurations, while
E06/I02 must adopt the verified schema check in CI. B01–B03 now establish the
pinned toolchain, lockfile and dependency boundaries; CLI/build ports,
cross-platform validation and CI remain separate work.

<a id="migration-a"></a>

### A. Baseline and decision

- [x] A01 — Preserve the reviewed comparison and raw samples. Evidence: the
      results table above and [results.json](results/results.json) retain
      measured versions, warmup/sample counts and benchmark limitations.
- [x] A02 — Account for baseline test inventory and skips. Evidence:
      [inventory.json](results/inventory.json), 43 files / 1,319 passing leaf
      tests; the five versions leaves and one recache orchestration leaf remain
      skipped; Bun reports two additional skipped hooks, not missing passing
      tests.
- [x] A03 — Record Bun as the chosen staged migration direction, with Biome and
      a major release explicitly required. Evidence: the current decision above
      follows
      [issue #1029](https://github.com/gadicc/yahoo-finance2/issues/1029);
      production readiness remains open in B–L.
- [x] A04 — Create the long-lived branch directly from the reviewed Bun
      experiment. Evidence: `codex/bun-migration` starts at
      `c1479eb2191a71ee162945cb811b6b064d572ca3`, the Bun commit in
      [plan 012](../../plans/012-test-runner-migration-experiments.md).
- [x] A05 — Establish an actionable tracker and branch agent instructions.
      Evidence: this table/checklist and [AGENTS.md](../../AGENTS.md) define the
      routing, independent/adversarial reviews and isolated commit policy.

<a id="migration-b"></a>

### B. Dependencies, configuration and installation

- [x] B01 — Select and pin the supported Bun development version and version
      upgrade policy; document platform prerequisites and verify version
      detection. Evidence: exact Bun 1.4.3 pins, bootstrap/upgrade policy and
      positive/negative detection controls in
      [milestone evidence](results/b01-b02-toolchain.json).
- [x] B02 — Choose Bun or another package manager and one authoritative root
      lockfile; define the relationship with the separate Cloudflare npm
      lockfile, remove obsolete experimental locks, and verify frozen installs
      reject drift. Evidence: Bun root package manager, authoritative unchanged
      `bun.lock`, removed root pnpm lock, explicit retained Deno/Workers scopes,
      clean default-lifecycle frozen install and manifest-drift failure with
      unchanged lock hashes in
      [milestone evidence](results/b01-b02-toolchain.json).
- [x] B03 — Separate runtime, build, test and release dependencies in the
      private root manifest, with generated package owners explicit; remove
      inherited unused runner dependencies and map the `deno.json`
      imports/exports/tasks/permissions/publish metadata to their owners.
      Evidence: private root runtime/development classification, exact release
      pins sourced from the existing Deno graph, runner pruning,
      [complete ownership map](DEPENDENCIES.md) and
      [isolated frozen-install/offline/typecheck controls](results/b03-dependencies.json).
      Generated package metadata and unmigrated Deno commands remain owned by
      F/J/B04 rather than being claimed migrated.
- [ ] B04 — Resolve source/tool imports without Deno import maps or `npm:` /
      `jsr:` specifiers; replace needed `@std` functions and remove the two
      throwing `walk`/`parseArgs` aliases only after real CLI/traversal paths
      execute.
- [ ] B05 — Verify clean-clone frozen installation on supported OSes with
      legitimate dependency lifecycle hooks enabled under an explicit trust
      policy; record reproducible commands rather than relying on
      `--ignore-scripts`.
- [x] B06 — Audit dependency versions, peer constraints, licenses and security
      advisories; validate native/optional dependencies and distinguish runtime
      dependencies from tools that must never enter the shipped package.
      Evidence: [dated actual-graph audit](DEPENDENCY-AUDIT.md) and
      [clean-install receipt](results/b06-dependency-audit.json), independently
      reviewed by Sol xhigh. Two unpatched advisories remain confined to
      repository-controlled test/release inputs; no production input path was
      identified. This is audit completion, not a zero-advisory claim; B05
      operating-system coverage remains open.

<a id="migration-c"></a>

### C. Test runner and harness

- [x] C01 — Demonstrate the full experimental Bun replay port without weakened
      assertions. Evidence: A02's inventory and the Bun measurements above; all
      1,319 actual passing leaves execute with file isolation and four workers.
- [x] C02 — Record assertion/lifecycle adaptations and limits. Evidence: “What
      was adapted” documents shared Jest assertions, `createRequire`, the
      zero-argument callback and unused context; skipped Deno bodies remain
      visible.
- [x] C03 — Choose a maintainable production runner/assertion/spy design and
      replace or justify the custom `.calls[].args` adapter; verify failure
      messages, cleanup, thrown/rejected failures, hooks, `onFinish` and
      table-driven tests. Evidence: [harness decision](HARNESS.md) and
      [C03–C05 results](results/c03-c05-harness.json), including 20 regression
      leaves and negative controls.
- [x] C04 — Verify fake clock parity for timer order, tick/runAll, promises,
      microtasks and restoration after failures, including queue/debounce tests.
      Evidence: focused clock regressions and unchanged full replay under
      parallel, isolated serial and repeated runs.
- [x] C05 — Verify global fetch/console/environment/mock restoration and file
      isolation under serial, parallel and repeated/watch runs; rule out order
      leaks. Evidence: isolated subprocess controls, failure restoration, full
      serial/parallel/repeat replay and guarded hard-watch restart probe. Native
      reruns require cleanup; maintained commands remain C07.
- [ ] C06 — Port and run recache subprocess orchestration checks (D05); decide
      and document coverage for the five skipped versions leaves and remove
      experiment-only skip/hook artifacts without concealing intentional skips.
- [x] C07 — Provide maintained full, focused, serial, watch and coverage
      commands with reliable exit codes, filtering and empty-suite behavior;
      verify production test discovery against the inventory, including new test
      files. Evidence: maintained launcher, 11 synthetic command/guard
      regressions, full/focused/serial/coverage results and watch discovery
      controls in [C07/D03 evidence](results/c07-d03-linux-guard.json).

<a id="migration-d"></a>

### D. Offline fixtures, recache and capture

- [x] D01 — Preserve fixture contents during the experiment. Evidence: all 1,201
      fixtures are byte-identical in the recorded verification; the migration
      setup changes no fixtures.
- [x] D02 — Demonstrate the experimental Linux offline boundary. Evidence:
      [verification.json](results/verification.json) and
      [socket trace](results/bun-socket-denial.trace) record missing-cache
      rejection, denied writes, IPv4/IPv6 and child socket denial plus
      compile-time controls. This does not verify production recache subprocess
      parity.
- [x] D03 — Define production default network policy for normal tests and CI,
      integration tests and explicit live capture/recache; preserve intentional
      auto capture behavior or document its deliberate replacement, without
      implicit network access in replay. Evidence:
      [maintained replay policy](TESTING.md), cleared capture environment and
      cache-miss/no-fallback controls. CI wiring remains I02 and explicit live
      capture remains D05.
- [ ] D04 — Replace or explicitly support the Python/libseccomp launcher on each
      supported OS; prove replay denies real network and fixture creation,
      modification and deletion in subprocesses, fails closed without its guard,
      and handles fresh-checkout permissions and missing-cache failures. Linux
      read-only mount, namespace, syscall, inherited-fd, writable-checkout and
      missing-guard controls pass in
      [C07/D03 evidence](results/c07-d03-linux-guard.json). Other supported
      operating systems remain unverified; item stays open.
- [ ] D05 — Port `recache-tests.ts` and run synthetic subprocess checks for
      baseline-before-live ordering, sequential pacing, request reuse, counters,
      nonzero failures, 429 aborts and preservation of earlier captures.
- [x] D06 — Port fixture traversal and rate-limit validators; verify changed,
      added and removed fixture reporting excludes earlier edits, rejects
      transient errors before commit, and keeps logs free of cookies, crumbs and
      payloads. Evidence: [D06 receipt](results/d06-fixture-validation.json),
      13 guarded focused checks and independent Sol xhigh review.
- [ ] D07 — Execute country-profile capture CLI paths with controlled inputs;
      verify append-only profiles, compaction/replay, expected-host checks and
      `.static`/`.fake`/geographic profile protection from generic recache.
- [ ] D08 — Verify environment clearing/allowlisting and simulated-fetch
      behavior under replay, nocache and recache; keep live Yahoo runs opt-in
      and outside offline verification, with unchanged-fixture hashes for replay
      gates.

<a id="migration-e"></a>

### E. Type checking and schema generation

- [x] E01 — Verify experimental compile-time overload coverage separately from
      runtime tests. Evidence: the passing Node/DOM-based Bun check and overload
      negative control in [verification.json](results/verification.json); native
      Bun ambient types still fail on `fetch.preconnect` as documented above.
- [ ] E02 — Choose production library and tooling TypeScript configurations;
      resolve or isolate native Bun ambient types without widening public fetch
      contracts, and remove obsolete Deno globals/shims from migrated paths.
- [ ] E03 — Check all production entrypoints, CLI/MCP, scripts and test helpers;
      keep real negative overload tests and independently check the Workers
      harness.
- [x] E04 — Port `schema-gen.ts` and generator resolution away from Deno cache,
      lockfile inspection and `deno info`; verify custom type formatters, JSON
      import handling and package resolution from a clean install. Evidence:
      Node APIs, compiler-host JSON overlays, retained custom formatter and
      [clean-install/compile/runtime controls](results/e04-e05-schema.json).
- [x] E05 — Prove generated schema parity against committed outputs, or review
      each justified difference; exercise explicit file, force, watch, timestamp
      and imported-type dependency behavior with deterministic output. Evidence:
      all 13 outputs retain exact non-comment bytes; reviewed comments advertise
      Bun and remove the unimplemented VSCode claim. Focused temporary-project,
      watch/shutdown, real shared-import negative controls and preserved output
      timestamps are documented in [schema behavior](SCHEMAS.md) and
      [verification](results/e04-e05-schema.json).
- [ ] E06 — Restore a stale-schema CI gate, including shared-schema consumers
      such as historical/chart; demonstrate an intentional stale schema fails
      and regeneration repairs it without recaching or loosening validation.
      Partial evidence: maintained no-write `bun run schema:check` plus real
      quote/options dependency and repair controls now pass; actual CI routing
      and verification remain I02/E06.

<a id="migration-f"></a>

### F. Package build and consumer artifacts

- [ ] F01 — Replace the Deno/dnt build with a documented reproducible build;
      preserve intended source-to-output mapping without treating test
      transpilation as a package build or hand-editing generated `npm/` output.
- [ ] F02 — Verify ESM and CommonJS builds, JSON/schema imports, declarations,
      public/subpath exports and resolution from clean installed tarballs.
- [ ] F03 — Verify shipped runtime dependencies, engines, versions and package
      metadata without Deno shims/import specifiers or accidental Bun-only
      library APIs; keep build/test/release dependencies out of the tarball.
- [ ] F04 — Inspect `npm pack` contents for schemas, LICENSE, README, `skills/`
      assets and intended binaries; exclude fixtures, secrets, experiment
      results, coverage, caches and unnecessary sources using an explicit
      package allowlist.
- [ ] F05 — Smoke-test the packed package as real ESM, CJS and TypeScript
      consumers on supported Node versions and Bun; verify declarations resolve
      without development config aliases or repository-relative files.
- [ ] F06 — Verify bin aliases, executable modes and portable shebangs; declare
      each shipped CLI's runtime requirement and exercise installation through
      npm exec/npx and the selected Bun command from outside the checkout
      (G01–G06).

<a id="migration-g"></a>

### G. CLI, MCP and runtime I/O

- [ ] G01 — Port both `bin/` entrypoints' arguments, environment, home-path
      resolution, filesystem errors, permissions and exit codes; cover missing
      HOME and supported OS path behavior through executable invocation.
      Partial source evidence: portable Node APIs, missing-HOME fast/error paths,
      real-path/symlink main guards and Node/Bun invocation pass; packed and
      supported-OS checks remain open. See [source phase](EXECUTABLES.md).
- [x] G02 — Verify CLI stdin/TTY behavior, JSON and terminal output, help,
      invalid arguments and dispatch errors; keep stdout usable for machine
      output. Evidence: real source child invocations, actual stdin, pipe JSON
      and separate real Linux PTY control in [source evidence](results/g01-g03-source-cli.json)
      plus fourteen focused executable regressions. Packed alias and OS proof
      remain F/G01/H05.
- [ ] G03 — Preserve cookie-store create-new behavior and restrictive file modes
      where supported; check existing files, concurrent creation and failure
      handling without exposing cookie values in output.
      Partial Linux source evidence: exclusive initial 0600 creation, preserved
      contents, descriptor chmod, rejected symlink/nonregular files, concurrent
      creators and fixed/redacted diagnostics pass. Windows/packed persistence
      verification remains open. See [source phase](EXECUTABLES.md).
- [ ] G04 — Verify MCP stdio protocol, HTTP startup, shutdown/signals and error
      paths using the packed executable and production SDK dependencies.
- [ ] G05 — Preserve MCP host validation, token comparison and non-local bind
      safeguards, including environment-provided tokens and explicit unsafe
      opt-out; add focused regression evidence for these security boundaries.
- [ ] G06 — Audit the loss of Deno runtime permissions across CLI/MCP and
      subprocess tooling; document and verify replacement limits or explicit
      trust requirements for filesystem, environment, network and child
      processes.

<a id="migration-h"></a>

### H. Supported runtime and platform matrix

- [ ] H01 — Define the consumer runtime/OS support matrix and minimums
      independently of the development runner: Node 22/24, Bun and Cloudflare
      Workers, with Deno governed by H02 rather than silently dropped.
- [x] H02 — Decide and document ongoing Deno consumer compatibility and JSR
      distribution with J01; removing Deno as a development dependency alone
      does not decide either policy. Evidence: explicit user decision to retain
      JSR and Deno consumers at the existing 2.0.0 minimum, with Deno binary use
      restricted to the isolated publisher. J01 implementation and H03/H05
      compatibility proof remain open; this item records policy only.
- [ ] H03 — Verify runtime detection/version enforcement and terminal behavior
      on each supported runtime, without an incidental compatibility global
      selecting the wrong runtime or introducing a Node/Bun API into Workers.
- [ ] H04 — Run the generated package in `tests/cloudflare` with its independent
      npm lockfile and Vitest 4 harness and supported overrides; verify
      Worker-safe imports and affected fetch/cookie/streaming behavior after the
      build replacement.
- [ ] H05 — Exercise supported Linux/macOS/Windows paths, process spawning, file
      permissions, watch and offline enforcement with the documented support
      policy; record unsupported behavior explicitly and guard it predictably.

<a id="migration-i"></a>

### I. CI, coverage and repair automation

- [ ] I01 — Replace the reusable setup action and test workflow's Deno steps
      with pinned Bun/tool installations and frozen dependency caches; prove
      clean CI installs on the supported Node/OS matrix without local caches.
- [ ] I02 — Gate formatting, lint, complete typecheck, stale schemas, release
      notes, offline tests and packed Workers compatibility using maintained
      commands; verify failed gates stop dependent release work.
- [ ] I03 — Audit coverage include/exclude rules and Deno/Istanbul ignore
      directives, source maps and branch/function accounting; establish
      comparable reports and intentional thresholds without claiming the
      benchmark engines produced equivalent coverage percentages.
- [ ] I04 — Verify LCOV/report artifacts and Codecov OIDC upload paths,
      permissions and failure handling; exclude generated/experiment files for
      documented reasons and avoid silently reducing coverage scope.
- [ ] I05 — Port the recache workflow's baseline/live/429 checks and artifact
      handling to the new commands; keep its current trigger policy, explicit
      network access and fixture-review/staging safeguards.
- [ ] I06 — Port schema-repair generation, verification and trusted restore
      jobs, including `schema-repair.ts`/git subprocesses and WIF proxy tooling;
      preserve interface/schema-only validation, untrusted candidate isolation,
      secret/log boundaries and independent artifact verification.

<a id="migration-j"></a>

### J. Major release and publication

- [ ] J01 — Record the JSR publication decision while recognizing JSR remains
      supported; implement retained publication without a Deno development
      runtime, or explicitly document a chosen distribution change with H02's
      consumer policy.
- [ ] J02 — Port `release.config.mjs`, version injection/`fix_versions.ts`,
      semantic-release plugins and generated package version sources; validate
      release notes with the conventionalcommits/writer compatibility
      constraints.
- [ ] J03 — Prepare the required new major release: explicit breaking-change
      scope, migration/upgrade guidance, runtime minimums, prerelease/channel
      policy and release-note examples that yield the intended semantic version.
- [ ] J04 — Verify release workflow build/test ordering, artifact provenance,
      npm/JSR OIDC and least-privilege tokens; remove the temporary root
      manifest overwrite only after validating plugin behavior and version
      propagation.
- [ ] J05 — Run a non-publishing release rehearsal against packed artifacts;
      inspect versions, exports, executable behavior and generated notes, and
      record rollback/recovery steps before any separately authorized
      publication.

<a id="migration-k"></a>

### K. Biome, documentation and developer experience

- [ ] K01 — Adopt pinned Biome formatting/lint configuration with reviewed rule
      equivalents and exclusions for fixtures, generated schemas/output and
      plans; separate formatting churn from runtime changes.
- [ ] K02 — Replace or justify Deno lint/format directives and verify Biome
      detects representative mistakes; align local commands and CI without broad
      suppressions masking substantive migration failures.
- [ ] K03 — Update README, CONTRIBUTING, AGENTS, upgrade and executable/skill
      instructions with clean-clone install, full/focused/serial/watch/coverage,
      offline/recache, schema, build and release commands that actually work.
- [ ] K04 — Replace VSCode Deno extension/settings and automatic schema-watch
      tasks with TypeScript/Biome tooling; verify language service, imports,
      formatting-on-save and background task lifecycle from a fresh checkout.
- [ ] K05 — Choose and verify API documentation generation/lint/watch/open
      commands and hosting links after the JSR decision; preserve export/JSDoc
      coverage without assuming `deno doc` remains available.
- [ ] K06 — Audit repository automation/docs for stale Deno references,
      including `renovate.json`, `.github/copilot-instructions.md`, the separate
      `copilot-setup-steps.yml` workflow, install snippets and runtime policy;
      distinguish retained consumer support and historical experiment
      instructions from obsolete contributor requirements.

<a id="migration-l"></a>

### L. Production readiness and review

- [ ] L01 — Run the complete new validation pipeline in clean clones on the
      agreed matrix, preserve fixture hashes and inspect generated/packed diffs;
      record actual results with tool versions and remaining intentional skips.
- [ ] L02 — Reconcile the final inventory and acceptance evidence with A–K;
      leave no throwing aliases, unverified shim behavior or experimental-only
      commands on production paths, and explain every remaining limitation.
- [ ] L03 — Obtain independent GPT-6.1 Sol xhigh review of the final migration
      and resolve findings with affected regression checks and recorded
      evidence.
- [ ] L04 — Obtain GPT-6 Astra xhigh final adversarial review explicitly seeking
      hidden defects, missed requirements, edge cases, regressions, security
      issues and test gaps; resolve findings and document residual risks.
- [ ] L05 — Record the production-ready decision, next merge/release action and
      exact validated commit; ensure summary counts, contributor commands and
      major-release readiness agree before considering the migration complete.
