# Bun test harness decision (C03–C05)

The native Bun runner owns discovery, file isolation and hooks. Project tests
use `projectIt` through `tests/common.ts`; direct runner imports continue to
expose native `it`/`test`. The project callback receives an unused `undefined`
context and an `onFinish` registrar, without Bun mistaking either parameter for
its callback completion API. `it.each` retains the existing `sprintf-js` names,
row arguments followed by context/registrar, and now forwards numeric timeouts.

## Lifecycle and failure contract

`runTest` owns callbacks per invocation, awaits the body (including thenables),
and drains callbacks once in registration order. Each callback receives the
original body error or `undefined` on success. All callbacks run even if one
throws or rejects. A sole error retains its identity; multiple errors become an
`AggregateError` with the body error first. Invalid immediate return values fail
and still run cleanup. Registration closes when the body settles. This fixes
unobserved async cleanup failures, duplicate callbacks on cleanup failure and
callbacks accumulating across reruns.

The native test timeout remains Bun's responsibility. It does not cancel an
unsettled body or guarantee its `onFinish` callbacks run. Resource cleanup must
use `using`, `finally`, or native hooks where appropriate. A process crash or
forced kill cannot guarantee JavaScript cleanup. The optional error callback
signature also cannot distinguish a successful body from `throw undefined`; the
runner nevertheless preserves the rejected test outcome.

## Assertions and mocks

Retain the pinned upstream Jest `expect` implementation: the experiment found
six assertion differences with native Bun matchers. The CommonJS entry loaded
with `createRequire` avoids Bun's broken named ESM exports. The optional Deno
message now prefixes thrown/rejected matcher diagnostics, including
`.not`/`.resolves`/`.rejects`, while preserving matcher errors and
expected/actual diffs. Static helpers and custom matcher registration remain
upstream Jest.

Retain the small spy adapter instead of translating the suite to a runner's
mock-call arrays. Actual consumers need `.calls[].args`, including logger calls
and fetch arguments. The adapter records receiver, returned value (including
promise identity), or synchronous thrown value and calls functions with their
original receiver. Promise rejection is the returned promise's outcome, rather
than a synchronous spy error. This is an intentionally bounded function-spy
surface, not a replacement for all Deno/Jest module or constructor mocking APIs.

Stubs replace properties with `defineProperty`, restore the complete original
own descriptor, and delete temporary own properties for inherited methods.
Configurable accessors and configurable read-only methods restore exactly;
immutable properties reject installation. `restore()` and disposal are
idempotent, and nested stubs enforce reverse installation order instead of
silently overwriting a newer stub. No dependency or production source change is
needed. Tests still own cleanup; plain spies do not modify globals themselves.

## Clock behavior

Retain pinned Sinon fake timers for the suite's `FakeTime` surface. Fake Date,
timeouts and intervals match the APIs actually used. `tick`/`runAll` advance
synchronously; native promise and `queueMicrotask` callbacks run after that
synchronous work. `tickAsync` drains those microtasks between due timers. Native
microtasks, performance timing and process clocks are not replaced.
Cancellation, same-deadline ordering, intervals, Date advancement, thrown
timers, and disposal are covered. Restoring an old clock twice cannot uninstall
a later clock. Existing queue interval, quoteCombine debounce, retry-delay and
recache pacing tests pass unchanged under this design.

## Isolation evidence and boundaries

`tests/harness.test.ts` adds 20 native Bun test leaves, without HTTP fixtures.
Its subprocess controls deliberately fail bodies/async cleanup, require a
nonzero exit, verify `afterEach` execution and fetch/console/environment
restoration, and verify following tests execute. File-isolation controls leave
fetch, console and a global sentinel mutated, then require clean state in the
next isolated file. Repeated-run controls explicitly clean up and verify that
finish callbacks do not accumulate.

Bun 1.4.3's `--rerun-each=2` preserves file globals between repetitions even
with `--isolate` or `--parallel`. A deliberately uncleaned sentinel therefore
fails its second repetition. Do not assume repeated runs substitute for cleanup.
The complete real suite passes twice, with cleanup intact. Serial execution
requires `--isolate`; `--parallel` implies it. The unisolated runner is not an
accepted command for this suite.

A separate guarded `bun --watch test <temporary-file>` probe changed the file
once after its first pass. Both process runs began with clean fetch, console,
global sentinel and environment state, despite intentionally leaking them in the
previous run. Watch hard restarts and native repeated runs have different
semantics. A maintained watch command and its automated command-level tests
remain C07; this evidence does not claim soft/hot reload compatibility.

Final Linux evidence with Bun 1.4.3 and Node 24.21.0:

- Full guarded parallel replay: **1,339 pass, 8 skip, 0 fail**, 44 files.
- Full guarded serial `--isolate`: **1,339 pass, 8 skip, 0 fail**, 44 files.
- Full guarded `--parallel=4 --rerun-each=2`: **2,678 pass, 16 skip, 0 fail**,
  44 files.
- Focused harness: **20 pass, 0 fail**; guarded TypeScript check passes.
- All original 1,319 passing leaves and eight baseline skips remain accounted
  for; the 20 new leaves explain the inventory increase. Versions and recache
  subprocess skip policy remains C06.
- Before/after fixture SHA-256 manifests match byte-for-byte; fixture contents
  and permissions remain read-only. The manifest SHA-256 is
  `8f25b1801e7d2def98b91fcc1b3ce44bcea5a6a0f598f0ac5f1c2bcc58f8f8c1`.

All execution used `tests/migration/offline.py`, including inherited subprocess
and watch execution. Serial/repeat commands used the same discovered file list
as `run.py`, excluding `tests/cloudflare`. No network fallback or recache ran.
C03 and C04 are covered for the existing suite's API surface. C05's Linux
serial/parallel/repeat and watch restart checks pass; maintained command support
and other operating systems remain separate milestones.
