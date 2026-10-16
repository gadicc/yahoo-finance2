# Maintained production TypeScript checks (E02–E03)

The checker runs the root-pinned TypeScript 6.0.3 compiler API with Bun 1.4.3.
It does not depend on Python, `YF_EXPERIMENT_NODE`, a Deno binary, the Deno
import map, or Bun's newer TypeScript checker. Installation remains separate.
The retained `deno.json` supplies the consumer export inventory and package
metadata; it does not resolve compiler imports.

```sh
bun scripts/typecheck.ts
bun scripts/typecheck.ts --incremental
bun scripts/typecheck.ts --negative
bun scripts/typecheck.ts --list
bun scripts/typecheck.ts --project library
bun scripts/typecheck.ts --project tools
```

Normal and incremental checks return 1 on any diagnostic or operational failure.
Every selected effective configuration is validated before any cache creation or
publication: inherited `noCheck: true` and explicit false overrides of strict
checks are refused even with `strict: true`. The pinned TS6 policy covers
`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`,
`strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis`,
`useUnknownInCatchVariables`, and the independently enabled TS6 `alwaysStrict`
parser default. Absent settings inherit the intended strict defaults; explicit
true settings and `noCheck: false` remain valid. Invalid configuration in a later
project cannot publish an earlier project's new successful build info.
Unknown flags, missing/unknown projects, duplicate modes and incompatible options
return 2; help returns 0. The commands work outside the repository's current
working directory. Normal checks do not write output. Every invocation reports
its selected projects and independent Workers boundary; `--list` prints actual
root inventories, export keys and configuration exclusions. The root package
scripts `typecheck`, `typecheck:incremental` and
`typecheck:negative` invoke this maintained checker directly.

## Compiler environments and coverage

`tsconfig.base.json` selects strict ES2022 target, ESNext modules with Bundler
resolution, `.ts` imports, JSON imports, no emit, and Node-only ambient types.
Its libraries are ES2022 and standard DOM/iterable/async-iterable definitions.
Third-party declarations retain `skipLibCheck: true`, matching the established
project/build policy; packed consumer declaration checks independently use
`skipLibCheck: false` in the packaging proof. Node 24's pinned declarations
reference their own compatibility libraries, including disposable resources and
float16 types; this checker is not a complete minimum-runtime API validator.
Actual supported-runtime package probes remain required.

`tsconfig.library.json` checks every non-test `src/**/*.ts` file plus every
`bin/**/*.ts` file. The command reads the actual consumer export map, requires
every export source to be a production root, and requires both executable
entrypoints. All 28 retained export keys and all 58 production roots are covered.
No test or Bun/Deno global environment is selected for this check.

`tsconfig.tools.json` checks maintained TypeScript scripts recursively, including
private child/preload entrypoints that appear only in subprocess argument
strings, test helpers, source tests, root release configuration, tool JavaScript,
and maintained package probes. JavaScript uses `checkJs: true`; it is not merely
parsed or silently exempted. The tooling environment uses ES2024 for existing
`Array.toSorted` and `Promise.withResolvers` tests on the pinned Bun host, plus
explicit disposable-resource types for `using` cleanup. This does not change
the library environment or consumer support.

The bounded `bun:test` module declaration describes only the native registration
and hook surface used here, including the numeric third timeout argument.
`runner.ts` invokes that native signature directly. It no longer pretends that
Bun is `node:test`. Full native Bun ambient types remain unselected: their
`fetch.preconnect` extension must not change the public standard DOM fetch
contract. Compile-time controls prove a normal async fetch implementation is
accepted, `preconnect` is absent, and Bun/Deno globals do not leak into tools.

`tsconfig.json` provides the combined editor inventory. It inherits only the
bounded `bun:test` module mapping from the tools configuration. The root no
longer maps `@std` imports to throwing compatibility stubs, and the root
dependency graph no longer installs `@types/deno`. The country-capture CLI, its
helper and process tests, and the geographic fixture helper tests are included
in the maintained tools graph.

## Explicit outstanding and historical exclusions (2026-10-16)

| Path or group | Reason and owner |
| --- | --- |
| `tests/cloudflare/**` | Independently npm-managed Workers environment and TypeScript gate; H04 owns its configuration and proof. The root checker does not substitute Node ambient types for Workers types. |
| `tests/migration/std-tooling.ts` | Inactive throwing stub retained only for historical experiment configurations; no active root mapping or maintained command imports it. |
| `tests/migration/guard-probe.mjs` | Historical experiment driver; current guard regressions live in `scripts/testing.test.ts`. Do not execute this probe through the historical writable-fixture guard. |
| `tests/migration/{benchmark,prepare,run,watch,offline,negative-typecheck}.py`, `tsconfig.migration.json`, `tsconfig.bun-native.json` | Historical experiment/reproducer files. Maintained checker commands do not invoke or extend them. |
| Fixtures, result receipts, generated output, dependencies and coverage | Data or separately generated/installed artifacts rather than maintained root checker inputs. |

Release configuration and publisher wrapper JavaScript are semantically checked;
the legacy Deno release preparation command itself remains J02/J04 work and is
not executed here. Workers coverage requires its
independently reviewed [H04 evidence](results/h04-workers.json) and
[Workers policy](WORKERS.md); the root checker does not execute that gate.
Selecting only the library is not a claim that all repository environments passed.

## Incremental cache ownership

Only `--incremental` creates `.migration-results/typecheck-v1/`, which is covered
by the repository's existing ignored `.migration-results` directory. A regular
exact ownership marker and only the recognized library/tools build-info files
are accepted. Symlinked parents/directories, symlink or dangling outputs,
hardlinked files, unknown ownership and foreign contents fail without adoption,
recursive deletion or output truncation. The compiler's writer permits only the
two fixed build-info paths. It stages new regular files privately, validates
existing targets again, then renames each file atomically. There is no arbitrary
cache-directory CLI switch or automatic cache purge. Inspect/move an unrecognized
cache explicitly. A crash can leave an unrecognized staged file requiring that
same explicit inspection. These are cache-safety controls, not a hostile
concurrent-filesystem sandbox.

Incremental checks still read source contents. A changed source forced back to
its previous timestamp must fail with its real TypeScript error; a failing
project does not replace its previous successful cache. Each project's cache is
independent, so another successfully checked project can update its own cache.

## Negative controls and version compatibility command

`--negative` copies the maintained source/config graph into a fresh temporary
project without HTTP fixtures, result data, Workers or generated output. It
links only the already-installed dependency graph; this is a typecheck harness,
not evidence of an independent consumer installation. Its scratch parent cannot
be inside the repository. It first checks a clean mirror, removes the actual
options overload `@ts-expect-error` directive and requires TS2322, then injects
invalid assignments into real `src`, `bin`, non-test script and test-helper
include paths. Each must produce TS2322 in its owning compiler project. An
invalid JavaScript script must also fail. Additional controls append invalid
assignments to the actual country-capture CLI, both capture test files and
`getCrumb.geo.test.ts`; each must already be present in the clean tools roots
and must produce TS2322. A future `Array.toSorted` call in
production must produce TS2550 under ES2022. Mirror cleanup touches only the
private directory created for that invocation; repository files and fixtures
are never temporary mutation targets.

`scripts/fix_versions.ts` now delegates to the stable npm builder with a required
`--version`, optionally forwarding the builder's safe `--out-dir`. It rebuilds
the package manifest and both runtime metadata JSON versions together instead
of regex-editing obsolete dnt `deno.js` paths. The builder preserves its
staging/ownership/validation contract. An I/O failure during final package
replacement retains the builder's documented bounds. This compatibility command
does not port or authorize publication; the legacy release prepare command
still needs J02/J04 migration.

Focused regressions run through the maintained strict offline launcher:

```sh
bun scripts/test.ts scripts/typecheck.test.ts scripts/fix_versions.test.ts
```

The [E02 stage evidence](results/e02-e03-typecheck.json) preserves its earlier
D07 exclusions and dependency snapshot. It records exact source hashes,
normal/incremental/negative commands, meaningful failures, fixture/schema
immutability and the explicit coverage gaps. Independent reviews remain required
for each integration checkpoint.

## B04/E03 integration delta (2026-10-16)

The reviewed D07 country-capture port is committed at `8e9f34e`. The active
root compiler graph includes its portable CLI and all maintained capture tests.
The immutable integration snapshot checks 58 library roots/73 project files,
99 tools roots/171 project files, and 157 editor roots/172 project files, all
without diagnostics. All 28 consumer export keys remain covered. Concurrent
HTTP probe work is outside that snapshot; it remains covered by normal
discovery when integrated. Historical experiment configurations are
retained unchanged to explain earlier receipts; reproducing them requires their
matching checkout and dependency graph. Their old Deno ambient selection and
throwing aliases do not define current development dependencies. The retained
`deno.json`/`deno.lock` remain consumer/publisher metadata; this integration
does not run Deno, remove JSR distribution, or change consumer exports.

The [integration receipt](results/b04-e03-integration.json) records a fresh
frozen Bun installation with normal lifecycle hooks, parsed import inventory,
current compiler roots, 41 focused tests and expanded negative controls. The
independently reviewed H04 Workers gate is complete with its documented
third-party declaration limits; its receipt remains separate. Release-command
migration retains its own owner and is not exercised by these checks.
