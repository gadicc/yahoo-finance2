# Offline test runner experiment

Measured on 2026-10-16 from `f3a2c4cd0273ece8693dbd1387fcd06daa8b8bb1`. This
compares test execution only. Production library files, schemas, fixtures,
package build/release tools, CI and the default branch implementation are
unchanged.

## Result

All candidates execute the same **1,319 actual passing leaf tests across 43
files**. The existing six skipped leaf tests remain. Bun is the fastest measured
runtime and deserves a migration trial beyond tests. Vitest has useful watch
feedback and a clean Node-based port. `node:test` works, but gave no full-suite
speed advantage over Vitest here. These branches are experiments; no final
runtime was selected.

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
limit, not a native-Bun typecheck pass. Reproduce the additional failure with:

```sh
python3 tests/migration/offline.py "$YF_EXPERIMENT_NODE" node_modules/typescript/bin/tsc -p tsconfig.bun-native.json
```

`tsconfig.bun-native.json` exists only on the Bun branch. Production/API changes
to resolve that typing difference are outside this experiment.

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

## Reproduce

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

The next migration decision should account for deferred schema/build/release/CLI
tooling and packed npm compatibility (Node consumers, ESM/CJS, declarations and
exports), beyond this test-runner result. Avoid inferring package-build or
production-runtime performance from these replay benchmarks.
