# B03 dependency and configuration ownership (historical snapshot)

This B03 snapshot preserves its original ownership and version receipts. See
the dated F01–F06 and B04/E03 deltas below for current ownership.

The root `package.json` remains a **private migration workspace**, with exact
versions and `bun.lock` owning its JavaScript graph. It is not the published
`yahoo-finance2` manifest. `scripts/build_npm.ts` still creates that manifest
from `deno.json`; its public exports, binaries, engines and release metadata
are unchanged. B04, E04, F01–F06 and J01–J04 still own the implementation ports.

## Root JavaScript dependencies

| Class / current owner | Packages (exact versions in package.json) | Source evidence / next owner |
| --- | --- | --- |
| Runtime: library cookies | `tough-cookie` 6.0.2 | `src/lib/cookieJar.ts`, `src/lib/getCrumb.ts`; F03 keeps the shipped dependency |
| Runtime: CLI persistence | `tough-cookie-file-store` 3.3.0 | Both `bin/` entrypoints; G03/F03 |
| Runtime: MCP | `@modelcontextprotocol/sdk` 1.32.0, `zod` 4.6.5 | `src/mcp/server.ts`, `src/mcp/http.ts`, MCP binary; G04–G05/F03 |
| Tests: assertions / table names | `expect` 30.4.1, `jest-get-type` 29.6.3, `sprintf-js` 1.1.3, `@types/sprintf-js` 1.1.4 | `tests/migration/assertions.ts`, `tests/common.ts`; C03 |
| Tests: fake clocks | `@sinonjs/fake-timers` 15.0.0, `@types/sinonjs__fake-timers` 15.0.1 | `tests/migration/time.ts`; C04 |
| Tests: fixture replay | `fetch-mock-cache` 3.1.0 | `tests/common.ts`, `tests/migration/guard-probe.mjs`; D03–D08 |
| Build/schema and repair | `ts-json-schema-generator` 2.9.0 | `scripts/schema-gen.ts`, `scripts/schema/createGenerator.ts`, `scripts/schema-repair.ts`; E04/I06 |
| Compile-time tooling | `typescript` 6.0.3, `@types/node` 24.10.1, `@types/deno` 2.5.0, `@types/json-schema` 7.0.15 | `tsconfig.migration.json`, `src/lib/validate/index.ts` type-only import; E02–E03 |
| Release core and configured plugins | `semantic-release` 25.0.9, `@semantic-release/commit-analyzer` 13.0.1, `@semantic-release/release-notes-generator` 14.1.1, `@semantic-release/npm` 13.2.0, `@semantic-release/github` 12.0.10, `@semantic-release/exec` 7.1.0, `@sebbo2002/semantic-release-jsr` 4.0.2 | `release.config.mjs`, `scripts/semantic-release-jsr.mjs`; J02/J04 |
| Release preset | `conventional-changelog-conventionalcommits` 9.3.1 | `release.config.mjs`, `scripts/check-release-notes.mjs`; J02 |

Every retained preexisting direct dependency keeps its exact version. Added
release versions come from the committed `deno.lock` npm records, including
its previously transitive configured plugins; these are explicit root tools
now. The notes generator uses writer 8.4.0 and preset 9.3.1, preserving the
existing documented writer/preset contract. Node 24.21.0 satisfies release
core's `^22.14.0 || >=24.10.0` engine. This is not a release workflow port:
Deno preparation, JSR publication and the workflow manifest overwrite remain
J01/J02/J04. No publisher was invoked.

`@types/json-schema` is now direct rather than relying on the generator's
hoisted transitive declaration package. `src/lib/validate/index.ts` imports
`JSONSchema7` from `json-schema` using `import type`; there is no runtime
`json-schema` load and no reason to add its JavaScript implementation to the
root runtime graph. Declaration packaging remains F02–F03.

`fetch-mock-cache` is test-only in the current source: no non-test `src/` or
`bin/` imports reference it, and `src/lib/versions.ts` uses `fetch` directly.
The old dnt build nevertheless explicitly lists it as a generated package
runtime dependency. That declaration stays untouched here; **F03 owns removing
or justifying it with packed-package evidence**. Root classification alone
does not alter consumers' existing packages.

Removed root `vitest`, `@vitest/coverage-v8` and `tsx` belong to completed
comparison candidates. `tests/migration/run.py` selects Bun unconditionally;
its dormant Vitest/Node branches are historical experiment code. Reproducing
`benchmark.py`/`watch.py` comparison results requires the corresponding
historical candidate checkout and its own graph, as REPORT.md describes; these
scripts are not a root bootstrap requirement. `@types/bun` 1.3.8 is also removed: the checker explicitly selects Node/Deno
ambient types and maps `bun:test` to its checked adapter. Native Bun ambient
types still conflict with the public DOM fetch contract (`fetch.preconnect`);
E02 owns resolving or isolating them without widening that contract.
The independently npm-managed
`tests/cloudflare` Vitest 4 harness and lockfile are unchanged.

## Every deno.json import

The file and its lock remain transitional owners wherever the table says
Deno. Repeated SDK subpaths are grouped explicitly. No JSR alias or real Deno
CLI path is removed in this milestone.

| Import key(s) | Current dependency/configuration owner | Migration owner |
| --- | --- | --- |
| `@deno/dnt` | Deno/JSR build tool; `scripts/build_npm.ts` | F01 replaces build, then B04 removes alias |
| `@gadicc/fetch-mock-cache` | Retained Deno/JSR alias; Bun fixture helpers use root npm adapter | B04 reconciles unused alias; D03–D08 own fixtures |
| `@modelcontextprotocol/sdk/client/index.js`, `@modelcontextprotocol/sdk/inMemory.js` | Root SDK; test clients share runtime package | B04 resolves imports; C03/G04 |
| `@modelcontextprotocol/sdk/server/mcp.js`, `@modelcontextprotocol/sdk/server/stdio.js`, `@modelcontextprotocol/sdk/server/streamableHttp.js`, `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`, `@modelcontextprotocol/sdk/types.js` | Root SDK runtime; Deno aliases retained | B04/G04/F03 |
| `@sebbo2002/semantic-release-jsr`, `@semantic-release/exec`, `semantic-release`, `conventional-changelog-conventionalcommits` | Root exact devDependencies and retained Deno mappings/lock for existing workflow | J01–J04/B04 |
| `@std/async` | Deno schema tool's debounce | E04 watch behavior/B04 replacement |
| `@std/cli` | Deno schema, capture and version scripts' parseArgs | E04/D07/J02/B04 |
| `@std/expect`, `@std/fmt`, `@std/testing` | Retained historical Deno test aliases; current tests use migration adapters | B04 removes after import audit; C03/C04 own replacements |
| `@std/fs` | Deno schema/recache traversal; two guarded migration aliases still throw | B04/E04/D05–D06 execute real traversal before removal |
| `@std/path` | Deno schema and executable paths | B04/E04/G01 portable path replacement |
| `@types/json-schema` | Root direct devDependency; retained Deno type mapping | E02–E04/F02 |
| `fetch-mock-cache` | Root test dependency; old generated manifest still includes runtime declaration | D03–D08/F03 |
| `jest-get-type` | Root test dependency | C03/B04 |
| `json-schema` | Retained Deno npm implementation mapping; source type-only import resolves root `@types/json-schema` | B04/E02/F02 audit type resolution |
| `oas-schema-walker` | Retained Deno mapping; only commented-out schema-gen import, no active caller | E04/B04 remove obsolete mapping; no root dependency |
| `tough-cookie`, `tough-cookie-file-store`, `zod` | Root runtime dependencies and retained Deno mappings | B04/F03/G03–G04 |
| `ts-json-schema-generator` | Root schema/repair devDependency; Deno generator still inspects Deno cache/lock | E04/I06/B04 |

## Every deno.json task

| Existing task(s) | Current command owner | Production replacement owner |
| --- | --- | --- |
| `check` | Deno full entrypoint checker; root typecheck currently covers the experiment inventory | E02–E03 expand production configurations/coverage |
| `cli`, `install-cli` | Deno executable launcher / global install | G01–G06/F06/K03 |
| `docs:gen`, `docs:lint`, `docs:open`, `docs:watch` | Deno doc plus jq/OS opener and Deno watch subprocess | K05 (JSR decision J01), K03–K04 |
| `schema_` | Existing TODO placeholder, no working command | E04/K03 remove placeholder when real schema commands land |
| `schema`, `schema:check` | Deno generator and git schema-diff gate | E04–E06/I02 |
| `release:check-notes` | Node contract check, now root release dependencies | J02/I02; guarded Node command verified in B03 |
| `test`, `test:serial`, `test:replay` | Retained Deno definitions; active Bun replay uses root package scripts and guarded Python launcher | C03–C07/D03–D04; Deno definitions are not claimed to run migrated Bun tests |
| `test:recache` | Deno subprocess/pacing script; not run in B03 | D05/D08/I05 |
| `fixtures:capture:getcrumb` | Deno controlled capture CLI; not run in B03 | D07/D08 |
| `test:cloudflare` | Deno build followed by independent Workers npm ci/test | F01/H04/I02 |
| `lock:cloudflare` | Independent npm 10.9.9 lock maintenance | H04/B02, outside root Bun graph |
| `build:npm` | Deno/dnt generated package | F01–F06 |
| `devTODO` | Existing stale `main.ts` placeholder, no production use | K03/K06 remove during command audit |

## Remaining deno.json metadata and boundaries

| Field | Current owner | Future owner / required preservation |
| --- | --- | --- |
| `name`, `version` | JSR identity and placeholder version; source defaults, validation, versions and both binaries import this JSON | J01–J02/F01 move shared metadata/version injection; root stays private |
| `exports` (all 28 entries) | Deno/JSR entrypoints and dnt generated package mapping | F02 checks full public mapping including `./src/index.ts`, module/other/lib and MCP subpaths; J01/H02 decide JSR/Deno retention |
| `permissions.test` and `test.permissions` | Deno fixture read/write paths, six named env controls (with ignore), five Yahoo hosts, default test permission set | D03–D04/D08/G06: explicitly own normal/live and replay policies; current Linux replay seccomp/read-only fixtures remain enforced |
| `imports`, `nodeModulesDir` | Deno import-map and auto installation for unmigrated tools | B04/E04/J02 retire Deno resolution; `bun.lock` alone owns root JS; Deno/Bun coexistence is transitional |
| `compilerOptions.lib` | Deno DOM/DOM iterable/DOM async iterable/deno.ns | E02–E03 choose separate library/tool configs; `tsconfig.migration.json` remains experimental |
| `fmt.exclude` | Deno formatter exclusions for fixtures, schemas, plans and .agents | K01–K02 preserve intentional exclusions in Biome |
| `publish.exclude` | JSR exclusion of CI/editor/docs/scripts/tests | J01 preserves retained JSR distribution; F04 owns independent npm allowlist |

`.bun-version` plus `packageManager` own development Bun pinning (B01).
`package.json` scripts own the guarded experiment commands; root adds no
consumer `exports`, `bin`, `engines`, name or publication metadata. Runtime
support remains H01–H05. `deno.lock` continues to own remaining JSR and
Deno tooling resolution; removing development Deno does not decide JSR or
Deno consumer compatibility. B06 still owns licenses, advisories, peers and
native/optional dependency auditing. B05 still owns cross-platform installs.


## Package-build ownership delta (F01–F06, 2026-10-16)

The [reviewed package build](PACKAGING.md) now uses root TypeScript 6.0.3
through `bun run build:npm`, with no Deno binary, dnt invocation or runtime
shims. Retained generated `deno.json` files are package identity/version data.
The obsolete `@deno/dnt` import-map alias remains unused pending B04; the B03
tables above describe the earlier snapshot rather than current execution.

The root manifest remains private with exact development pins. The generated
public manifest preserves all 28 export keys, Node >=22.0.0 and the existing
public dependency ranges from the retained import map. It ships four runtime
packages (`tough-cookie`, `tough-cookie-file-store`,
`@modelcontextprotocol/sdk`, `zod`) plus `@types/json-schema`, needed by exported
declarations. `fetch-mock-cache` remains private test tooling and is absent
from the packed runtime graph. The real fresh consumer resolved SDK 1.32.1
and zod 4.6.7 under those public ranges; these are consumer receipts, not root
pin changes. The explicit package allowlist excludes development dependencies,
fixtures and original source. Linux installed ESM/CJS/strict TypeScript proofs
cover every export on Node 22.0.0, Node 24.21.0 and Bun 1.4.3; see the
[F receipt](results/f01-f06-packaging.json) for exact commands and limits.

`scripts/fix_versions.ts` and release `prepareCmd` remain unported J02/J04
owners: their old dnt `deno.js` targets must not be used with the new output.
Version injection is now `bun run build:npm --version VERSION`; publication,
JSR/Deno 2 consumer execution, Workers integration and cross-platform validation
remain separate open work. The publishing-only Deno policy is unchanged.


## Root tool resolution delta (B04/E03, 2026-10-16)

All maintained library, executable, script, test-helper and package-probe imports
resolve through root npm dependencies and portable local paths. The active
root/editor configuration no longer maps `@std/cli/parse-args` or
`@std/fs/walk` to throwing migration stubs. The real schema, recache,
version and country-capture commands now use Node-compatible APIs through Bun.
The root `@types/deno` development dependency and its sole lock entry are
removed without upgrading other dependencies. The library and tools compiler
environments explicitly select Node ambient types and the tools alone map the
bounded native `bun:test` declaration.

The import audit examines parsed import/export declarations, import types and
literal dynamic imports in maintained TypeScript/JavaScript, rather than
matching strings inside synthetic CLI test programs. No maintained module
reference uses `@std/`, `@deno/`, `npm:` or `jsr:` resolution. Private subprocess
entrypoints remain compiler roots even when their filenames occur only in
process argument strings. The country-capture source and both test files, plus
its geographic helper consumer, have explicit negative include controls.

Retain `deno.json` and `deno.lock` for the JSR/Deno >=2 distribution and isolated
publisher. Source identity/version imports and the full 28-export inventory
still read that JSON; the npm builder also preserves public dependency ranges
from its import-map data. These reads do not activate Deno module resolution.
Unused historical import-map entries are retained rather than changing the
consumer/publisher metadata during this root dependency cleanup.

`tsconfig.migration.json`, `tsconfig.bun-native.json` and their historical
experiment drivers/stub retain their original context. They are excluded from
the maintained commands and may require the matching historical checkout and
dependency graph. Earlier dependency and benchmark receipts remain unchanged.
The independent npm-managed Workers graph remains outside the root lockfile.

`scripts/fix_versions.ts` now delegates validated version injection to the
complete npm builder; the preceding F delta records its earlier state. Legacy
release preparation still needs its separate J02/J04 port. A fresh frozen Bun
installation with normal hooks and exact dependency/import/compile evidence is
recorded in the [B04/E03 integration receipt](results/b04-e03-integration.json);
no Deno binary is used.
