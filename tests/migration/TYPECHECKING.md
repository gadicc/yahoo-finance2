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
its explicit D07/Workers coverage limitation; `--list` prints actual root
inventories, export keys and configuration exclusions. The root package script
handoff changes `typecheck` and `typecheck:incremental` from the experimental
Python launcher and adds `typecheck:negative` with these exact arguments.

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

`tsconfig.json` provides the combined editor inventory and retains the two
transitional `@std` runtime paths. Bun also reads that root configuration at
runtime: removing those aliases before D07 would break geographic fixture-test
imports. The library/tools compiler environments do not use those aliases.

## Explicit outstanding and historical exclusions (2026-10-16)

| Path or group | Reason and owner |
| --- | --- |
| `scripts/capture-get-crumb-fixtures.ts` | Unported Deno capture CLI; D07 must replace it before execution. |
| `scripts/capture-get-crumb-fixtures.test.ts`, `src/lib/getCrumb.geo.test.ts` | Both import that CLI's pure helpers; excluded from this compiler graph until D07. They remain in the guarded runtime replay inventory. |
| `tests/cloudflare/**` | Independently npm-managed Workers environment and TypeScript gate; H04 owns its configuration and proof. The root checker does not substitute Node ambient types for Workers types. |
| `tests/migration/std-tooling.ts` | Transitional throwing `@std` exports, still required for deferred D07 imports at runtime. B04 removes them after the real port. |
| `tests/migration/guard-probe.mjs` | Historical experiment driver; current guard regressions live in `scripts/testing.test.ts`. Do not execute this probe through the historical writable-fixture guard. |
| `tests/migration/{benchmark,prepare,run,watch,offline,negative-typecheck}.py`, `tsconfig.migration.json`, `tsconfig.bun-native.json` | Historical experiment/reproducer files. Maintained checker commands do not invoke or extend them. |
| Fixtures, result receipts, generated output, dependencies and coverage | Data or separately generated/installed artifacts rather than maintained root checker inputs. |

Release configuration and publisher wrapper JavaScript are semantically checked;
the legacy Deno release preparation command itself remains J02/J04 work and is
not executed here. E03 remains partial while D07 is outstanding. Workers coverage requires its
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
invalid JavaScript script must also fail, and a future `Array.toSorted` call in
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

The [stage evidence](results/e02-e03-typecheck.json) records exact source hashes,
normal/incremental/negative commands, meaningful failures, fixture/schema
immutability and the explicit coverage gaps. Independent reviews remain required
before this stage is committed.
