# Plan 012: Compare offline Deno, Bun, Vitest and node:test execution

## Status

- Priority: P1
- Effort: L
- Risk: MED
- Depends on: none (experimental branches only)
- Category: migration / tests
- Planned at: f3a2c4cd0273ece8693dbd1387fcd06daa8b8bb1, 2026-10-16
- Status: DONE (experiments reviewed; final migration selection remains separate)

## Why this matters

The user authorized the proposed migration experiments after discussing Deno's
end of company-led runtime development. Measure correctness, development speed
and adaptation cost before choosing Bun or Node with Vitest/node:test. Preserve
successful fixtures and public library behavior. This is an experiment, not a
migration of the default branch or a replacement of package build/release tools.

## Current state

- Repository: /home/dragon/www/npm/yahoo-finance2, clean dev at the planned SHA.
- Source is TypeScript with .ts local imports and JSON import attributes.
- deno.json maps npm and JSR specifiers. Root has no package.json.
- deno task test:replay clears FETCH_DEVEL, sets FMC_CACHE_MODE=replay, and
  invokes deno test --no-prompt -P=test --parallel --ignore=tests/cloudflare
  with --deny-net --deny-write. Pass --cached-only to forbid graph downloads.
- Tests are colocated in src/, tests/, scripts/. Most import tests/common.ts;
  eleven files use Deno.test directly. Cloudflare has its own Vitest harness.
- tests/common.ts wraps BDD, it.each, custom toBeType, spies and test
  (context,onFinish) callbacks. Preserve their meanings, including future
  recache lifecycle support, while benchmarks only execute replay.
- tests/fetchCache.ts imports @gadicc/fetch-mock-cache/runtimes/deno.ts and
  /stores/fs.ts. The installed npm fetch-mock-cache 3.1.0 has Node and Bun
  adapters plus a runtime-independent filesystem store. Bun adapter reuses Node.
- Global fetch, clocks and console are replaced by tests. Spy assertions read
  .calls[].args. FakeTime runAll/tickAsync must preserve microtask behavior.
- src/modules/options.type.test.ts has an empty runtime body; the real test is
  TypeScript assignments plus @ts-expect-error. A separate typecheck is required.
- Runtime enums exist in quoteSummary-iface.ts and streamer.ts: native Node
  type stripping alone is insufficient. Use tsx for node:test if necessary.
- scripts/recache-tests.test.ts requires run and /tmp write permissions and is
  skipped in ordinary Deno runs. Preserve/report skip differences explicitly.
- tests/cloudflare is separate and out of main-suite comparisons.
- scripts/build_npm.ts uses dnt; schema/build/CLI runtime migration is deferred.
- Tool versions observed: Deno 2.9.7, Bun 1.4.2, pnpm 10.33.2, Node v25.2.1.
  Prefer a supported Node 24/22 binary if already available; record exact one.
- Baseline log, fixture hashes and initial timing live in
  /tmp/yf-runtime-experiment/deno-baseline.{log,json}, fixture-hashes.json.
  Initial baseline: 86 passed (1333 steps), 0 failed, 2 ignored, runner 731ms.
- unshare --net and bwrap --unshare-net are unavailable due kernel permission
  restrictions. Use a verified alternative (e.g. seccomp deny AF_INET/AF_INET6
  socket creation before exec) for independent offline enforcement. Do not
  silently fall back to permitting network. Use non-writable fixture copies
  or permissions in disposable worktrees plus before/after fixture hashes.

## Scope

In isolated experiment worktrees only:
- tests/common.ts, tests/fetchCache.ts, tests/*.ts harness/helpers and *.test.ts.
- src/**/*.test.ts, scripts/**/*.test.ts runner-specific imports/glue only.
- New tests/migration/ tooling, runner configs, package.json, pnpm-lock.yaml,
  bun.lock, tsconfig variants, .gitignore (experiment outputs only).
- Import-resolution adaptations in experiment tooling, not public library code.
- Experimental notes under plans/ or tests/migration/.

Out of scope:
- Production source src/**/*.ts excluding test files, bin/, schemas, fixture
  contents, npm/, release/CI configuration and public exports/contracts.
- No live Yahoo requests, recaching, network benchmarks, validation weakening,
  expectation changes to conceal semantic differences, pushes, PRs or merges.
- Do not drop tests for speed. Report baseline skips and any unavailable tests.

## Git workflow

- Use managed isolated worktrees starting at the planned SHA. Initial worktree
  is provided by reviewer; create two additional managed worktrees as needed.
- Branch names: codex/test-runner-vitest, codex/test-runner-bun,
  codex/test-runner-node (or descriptive suffix if collision).
- No changes to user's dev source. Do not update plans/README.md; reviewer does.
- Commit each reviewable candidate using Conventional Commits with scope,
  motivation/body and Co-authored-by: Codex (model, reasoning: high), best effort
  model identification. Do not push, merge or open PRs.

## Steps and verification

1. Inspect AGENTS.md, CONTRIBUTING.md, test harness, direct Deno test calls,
   fixture cache adapters and all candidate dependencies. Compare git diff of
   in-scope files against planned SHA (must be empty initially). Read tool/docs
   as needed. Install only experiment dependencies using pinned resolutions.
   Dependency installation network is allowed; test execution network is not.
2. Build minimal runner-specific ports of a representative subset, including
   quote/chart, getCrumb, queue, quoteCombine, yahooFinanceFetch, CLI, MCP and
   options type checks. Prefer a small temporary compatibility helper if it
   avoids noisy test rewrites, but do not turn tests into Deno-runtime tests
   underneath another runner. Do not retain a broad fake Deno global that masks
   missing runtime migration work. A documented narrow shim for runner glue
   is acceptable during experimentation; expose its cost/limitations.
   Verify each subset passes with replay and unchanged fixture hashes.
3. Verify missing-cache failure, no fetch fallback/write, independent network
   denial, and fixture read-only behavior. Use intentional negative probes
   outside real fixture data. Keep simulated-fetch recache behavior tests;
   skip live-only capture/orchestration cases consistently with baseline.
4. Expand compatible candidates to the entire baseline test inventory. If
   a candidate has a fundamental blocker, record precise evidence and continue
   others. Report file/test/skip inventories, type checking, and failures
   honestly. Verify type tests are actually checked, not just transpiled.
5. Implement a repeatable benchmark driver and JSON results in an allowed
   experiment path. Run candidates sequentially, same hardware and workloads,
   no coverage first, short reporters/log redirection, warmup and at least
   5 measured samples. Compare full replay, focused invocation, coverage and
   typecheck/full validation where available. Distinguish cold process startup
   from persistent watch reruns and transform cache warmth. Record memory if
   reliable and machine/version/concurrency settings. Compare equivalent
   isolation/concurrency and document safe optimized configurations separately.
   Do not run unlimited tuning/repetition. Installation/build are separate.
6. Produce a concise report with actual commands, results, compatibility work,
   blockers, recommended next step, and limitations (including unavailable
   watch/coverage/memory measurements). Check git diff --check, fixture hashes,
   and final git status for each worktree. Ensure no source/fixture drift.

## Done criteria

- Replay Deno baseline and candidate results have recorded exit statuses and logs.
- Each viable candidate has a reviewable separate branch/worktree, commands,
  lockfile and reproducible benchmark instructions.
- Full baseline inventory is accounted for, including original skip reasons.
- Offline/read-only guards have positive negative-control evidence.
- Candidate runtime tests pass or blockers are explicit, with compile-time
  overload test checking preserved separately.
- Repeated comparable timing samples and a report exist; no live requests,
  fixture/schema/production-source modifications, merges or pushes occurred.
- git diff --check passes and changes stay in scope.

## STOP conditions

- Any experiment would require production runtime behavior, schema or fixture
  changes: stop that repair, report evidence; continue independent candidates.
- Dependency access or offline enforcement cannot be established: report exact
  limitation and continue other independent work, never silently relax guards.
- A verification fails twice without a clear runner/harness explanation: report
  and request reviewer direction before changing test expectations.
- A candidate requires a wholesale framework to emulate Deno rather than
  executing on the target runtime: report adaptation cost and reconsider it.

## Maintenance notes

Adapters are experimental scaffolding, not automatically the final design.
Preserve test lifecycle semantics and report deviations. Final runtime choice,
package build replacement, CLI/schema tooling port and supported-runtime smoke
matrix are later work after the comparison is reviewed.

## Reviewed outcome

All 43 baseline test files are accounted for; each candidate executes 1,319 real
passing tests and retains the baseline skips. All 1,201 fixture contents remain
unchanged. Independent review reran the documented runtime commands, full type
checks, compile-time overload negative controls and offline guards. Bun's socket
errno remapping was verified with a syscall trace showing kernel EPERM for IPv4,
IPv6 and child exec, with zero connect/io_uring calls. Test-only formatting/lint
and committed scope checks passed. No production source, schemas, fixtures,
release/build tooling or CI were changed, and nothing was merged or pushed.

| Candidate | Branch | Reviewed commit | Full replay median |
| --- | --- | --- | ---: |
| Vitest 5.0.3 | codex/test-runner-vitest | cbffaf52fa83c33f9ed2cf6953e5f8c7b79f2588 | 2.370s |
| Node 24.21.0 / node:test / tsx | codex/test-runner-node | 83d92a5664332f46648642e59840036edafbee53 | 2.482s |
| Bun 1.4.2 | codex/test-runner-bun | c1479eb2191a71ee162945cb811b6b064d572ca3 | 0.483s |
| Deno 2.9.7 baseline | dev at planned SHA | f3a2c4cd0273ece8693dbd1387fcd06daa8b8bb1 | 1.428s |

The full report and reproducible tooling are committed under
`tests/migration/REPORT.md` on each experiment branch. The active review copy is
[here](../tests/migration/REPORT.md).
Each timing uses one warmup and five measured samples, four isolated workers,
replay-only execution and separate type checking. Coverage engines differ;
unchanged-graph and incremental typechecks, watch triggers, native Bun ambient
typing limits and unmeasured cold/install/memory costs are explicit in the report.

## Publication and migration follow-up (2026-10-16)

After the reviewed experiment was complete, the user authorized publication of
all three branches. They are now pushed to origin:
[Vitest](https://github.com/gadicc/yahoo-finance2/tree/codex/test-runner-vitest),
[Node](https://github.com/gadicc/yahoo-finance2/tree/codex/test-runner-node) and
[Bun](https://github.com/gadicc/yahoo-finance2/tree/codex/test-runner-bun). The
earlier no-push statements and selection deferral above describe the historical
experiment scope and completion point.

Bun is now selected for a slow, staged migration on `codex/bun-migration`,
starting at the reviewed Bun commit. The [migration report](../tests/migration/REPORT.md)
is the sole live acceptance tracker; Biome and a new major release are required.
Production implementation remains unchanged by this tracking setup.
