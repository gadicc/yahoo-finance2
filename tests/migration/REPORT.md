# Bun migration tracker and offline test runner experiment

## Rebase validation (2026-10-16)

Rebased onto `dev` at `93bb36d93ee1dbf013b6c9baf5c4a730f7ad8459`. The current
suite passes **1,329 leaf tests across 44 discovered files**, including six new
workflow-policy tests and four new schema-repair union tests. The new tests use
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
| [B. Dependencies, configuration and installation](#migration-b)  | Planned         |        0/6 |
| [C. Test runner and harness](#migration-c)                       | In progress     |        2/7 |
| [D. Offline fixtures, recache and capture](#migration-d)         | In progress     |        2/8 |
| [E. Type checking and schema generation](#migration-e)           | In progress     |        1/6 |
| [F. Package build and consumer artifacts](#migration-f)          | Planned         |        0/6 |
| [G. CLI, MCP and runtime I/O](#migration-g)                      | Planned         |        0/6 |
| [H. Supported runtime and platform matrix](#migration-h)         | Planned         |        0/5 |
| [I. CI, coverage and repair automation](#migration-i)            | Planned         |        0/6 |
| [J. Major release and publication](#migration-j)                 | Planned         |        0/5 |
| [K. Biome, documentation and developer experience](#migration-k) | Planned         |        0/6 |
| [L. Production readiness and review](#migration-l)               | Planned         |        0/5 |
| **Overall**                                                      | **In progress** |  **10/71** |

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
major release. JSR remains a supported service; distribution there and continued
Deno consumer support require explicit decisions in H02 and J01.

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

**Next small milestone:** decide and document the supported Bun version, package
manager and authoritative lockfile (B01–B02), then propose the minimal
production dependency/configuration shape (B03). No source, dependency or CI
migration is part of this tracker setup commit.

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

- [ ] B01 — Select and pin the supported Bun development version and version
      upgrade policy; document platform prerequisites and verify version
      detection.
- [ ] B02 — Choose Bun or another package manager and one authoritative root
      lockfile; define the relationship with the separate Cloudflare npm
      lockfile, remove obsolete experimental locks, and verify frozen installs
      reject drift.
- [ ] B03 — Separate runtime, build, test and release dependencies in the
      production manifest; remove inherited unused runner dependencies and map
      the `deno.json` imports/exports/tasks/permissions/publish metadata to
      their owners.
- [ ] B04 — Resolve source/tool imports without Deno import maps or `npm:` /
      `jsr:` specifiers; replace needed `@std` functions and remove the two
      throwing `walk`/`parseArgs` aliases only after real CLI/traversal paths
      execute.
- [ ] B05 — Verify clean-clone frozen installation on supported OSes with
      legitimate dependency lifecycle hooks enabled under an explicit trust
      policy; record reproducible commands rather than relying on
      `--ignore-scripts`.
- [ ] B06 — Audit dependency versions, peer constraints, licenses and security
      advisories; validate native/optional dependencies and distinguish runtime
      dependencies from tools that must never enter the shipped package.

<a id="migration-c"></a>

### C. Test runner and harness

- [x] C01 — Demonstrate the full experimental Bun replay port without weakened
      assertions. Evidence: A02's inventory and the Bun measurements above; all
      1,319 actual passing leaves execute with file isolation and four workers.
- [x] C02 — Record assertion/lifecycle adaptations and limits. Evidence: “What
      was adapted” documents shared Jest assertions, `createRequire`, the
      zero-argument callback and unused context; skipped Deno bodies remain
      visible.
- [ ] C03 — Choose a maintainable production runner/assertion/spy design and
      replace or justify the custom `.calls[].args` adapter; verify failure
      messages, cleanup, thrown/rejected failures, hooks, `onFinish` and
      table-driven tests.
- [ ] C04 — Verify fake clock parity for timer order, tick/runAll, promises,
      microtasks and restoration after failures, including queue/debounce tests.
- [ ] C05 — Verify global fetch/console/environment/mock restoration and file
      isolation under serial, parallel and repeated/watch runs; rule out order
      leaks.
- [ ] C06 — Port and run recache subprocess orchestration checks (D05); decide
      and document coverage for the five skipped versions leaves and remove
      experiment-only skip/hook artifacts without concealing intentional skips.
- [ ] C07 — Provide maintained full, focused, serial, watch and coverage
      commands with reliable exit codes, filtering and empty-suite behavior;
      verify production test discovery against the inventory, including new test
      files.

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
- [ ] D03 — Define production default network policy for normal tests and CI,
      integration tests and explicit live capture/recache; preserve intentional
      auto capture behavior or document its deliberate replacement, without
      implicit network access in replay.
- [ ] D04 — Replace or explicitly support the Python/libseccomp launcher on each
      supported OS; prove replay denies real network and fixture creation,
      modification and deletion in subprocesses, fails closed without its guard,
      and handles fresh-checkout permissions and missing-cache failures.
- [ ] D05 — Port `recache-tests.ts` and run synthetic subprocess checks for
      baseline-before-live ordering, sequential pacing, request reuse, counters,
      nonzero failures, 429 aborts and preservation of earlier captures.
- [ ] D06 — Port fixture traversal and rate-limit validators; verify changed,
      added and removed fixture reporting excludes earlier edits, rejects
      transient errors before commit, and keeps logs free of cookies, crumbs and
      payloads.
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
- [ ] E04 — Port `schema-gen.ts` and generator resolution away from Deno cache,
      lockfile inspection and `deno info`; verify custom type formatters, JSON
      import handling and package resolution from a clean install.
- [ ] E05 — Prove generated schema parity against committed outputs, or review
      each justified difference; exercise explicit file, force, watch, timestamp
      and imported-type dependency behavior with deterministic output.
- [ ] E06 — Restore a stale-schema CI gate, including shared-schema consumers
      such as historical/chart; demonstrate an intentional stale schema fails
      and regeneration repairs it without recaching or loosening validation.

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
- [ ] G02 — Verify CLI stdin/TTY behavior, JSON and terminal output, help,
      invalid arguments and dispatch errors; keep stdout usable for machine
      output.
- [ ] G03 — Preserve cookie-store create-new behavior and restrictive file modes
      where supported; check existing files, concurrent creation and failure
      handling without exposing cookie values in output.
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
- [ ] H02 — Decide and document ongoing Deno consumer compatibility and JSR
      distribution with J01; removing Deno as a development dependency alone
      does not decide either policy.
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
