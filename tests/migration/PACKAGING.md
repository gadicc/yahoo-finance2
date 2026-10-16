# Bun/TypeScript npm build (F01–F06)

`bun run build:npm` replaces dnt with the pinned TypeScript 6.0.3 compiler API.
The builder checks the complete production entrypoint graph with strict types,
Node ambient types and DOM libraries, then emits ES2022 ESM and CommonJS.
Third-party declarations retain the repository checker's `skipLibCheck: true`
policy during building; the installed consumer proof below separately checks
all declarations with `skipLibCheck: false`.

The build has no install, test, network, Deno binary, bundler or runtime-shim
step. The compiler host and type roots are anchored to the source checkout, so
invoking the builder by absolute path from another working directory is supported. Install the pinned root graph first with `bun install --frozen-lockfile`.
The private root package and its exact development dependencies are not the
published manifest. Public dependency ranges continue to come from the retained
Deno/JSR import map. Generated npm engines are Node `>=22.0.0` and Bun
`>=1.4.3`, derived from the same internal consumer policy used by constructor
warnings. Deno consumer support remains `>=2.0.0`; npm engine metadata does not
replace runtime checks or the separate JSR contract.

## Output and publication contract

All 28 `deno.json` exports retain their keys, including `./src/index.ts`, and
map to generated JavaScript. Each export selects ESM under `import` and CJS
under `require`, with a format-specific `types` condition before `default`.
The output keeps `npm/esm/` and `npm/script/`, including their `src/` layout;
top-level `module`, `main` and `types` fallbacks point at the root entrypoint.
CommonJS consumers retain `require("yahoo-finance2").default`.

The compiler processes the public library graph and two ESM executable roots.
It does not compile tests, fixture adapters or development tooling. Declaration
emission uses the production graph, not test transforms. The AST transform
rewrites relative `.ts` references in imports, re-exports, dynamic imports and
import types, preserving plain string values. It strips JSON import attributes
for CJS; ESM retains the Node-compatible `with { type: "json" }` syntax. Both
formats include all 13 committed schemas, even a schema not imported at runtime.
The CJS graph excludes executable entrypoints and their `import.meta` guards.

The published runtime dependencies are `tough-cookie`,
`tough-cookie-file-store`, `@modelcontextprotocol/sdk` and `zod`, preserving
the existing public ranges. `@types/json-schema` is a published dependency:
exported declarations refer to `JSONSchema7` through `json-schema`. There is
no runtime import of the JavaScript `json-schema` implementation.
`fetch-mock-cache` is removed from the public manifest: no emitted module
imports it, and real installed consumers exercise the library without it.
It remains a private development dependency for fixture replay.

`files` explicitly permits only the two output trees, LICENSE, README and
`skills/`. No original TypeScript (apart from declarations), fixtures, tests,
root tool graph, caches, source maps or build ownership marker enter the pack.
Both binaries are ESM with `#!/usr/bin/env node` and mode 0755; the aliases
`yahoo-finance2` and `yahoo-finance` share one target, and `yahoo-finance-mcp`
has its own target. They require Node 22.0+; explicit Bun execution is also
verified. All other generated files have normalized 0644 modes, directories
0755. Repository-owned compiler inputs, including imported JSON, metadata, source
entrypoints and their parent directories, cannot be symlinks or special files.
The compiler host checks paths before reading or canonicalizing them and rejects
repository escapes. Dependency inputs are a separate trusted boundary: normal
package-manager links in node_modules remain supported. Schema traversal rejects
linked files/directories instead of silently skipping them, and copied assets
use the same repository path validation.

The default destination is the repository's `npm/`. Rebuilding a nonempty
`npm/` requires this builder's regular ownership marker and recognized top-level
entries. Unmarked old dnt output is preserved and the build fails with guidance
to move it aside explicitly. `--out-dir` accepts a new or empty directory
outside the checkout; its existing contents are never recursively deleted.
The parent must already exist. Repository/fixture aliases, symlinks, dangling
symlinks and symlinked parents are rejected before compiling. Compilation and
asset copying complete in a sibling staging directory before output replacement.
Failed compilation leaves the previous output untouched.

`--version VERSION` sets the published package version and both runtime
metadata versions together. The default is the source `deno.json` version,
currently `0.0.1`; the private root manifest is not consulted. The generated
`esm/deno.json` and `script/deno.json` contain only the source package identity
and chosen version, preserving relative runtime imports without publishing
Deno development configuration. User-Agent and executable version probes
verify the injected version.

**Release handoff:** `scripts/fix_versions.ts --version VERSION` delegates to
the same complete builder. The [release guide](../../docs/RELEASING.md) describes
the initial prebuild, versioned Bun prepare, Node controller and isolated JSR
publisher order. Local build checks authorize no publication and do not replace
the final accepted-head publisher rehearsal or real registry/provenance gates.

## Guarded proof from a real tarball

The maintained build regressions run with:

```sh
bun run test -- scripts/build_npm.test.ts
```

They cover destructive-output refusals, ownership markers, symlink aliases,
argument/version errors, module-reference AST transforms, two identical builds,
all exports and schemas, modes, executable aliases and forbidden dependencies.
A fixture-free scratch project also builds from an outside working directory
and then rejects imported JSON links, linked parents, relative/export escapes,
linked root source/metadata, linked unimported schemas and FIFO metadata. Each
failure preserves the previous package digest and removes staging output. The
scratch compiler fixture uses a development dependency link explicitly; the
standalone packed consumer proof continues to use a real installation.

They run through the normal read-only repository/new network and PID namespace
plus seccomp guard. Do not substitute direct `bun test` for this evidence.

For a new standalone Linux proof, select the pinned Bun and Node 24.21.0 first.
The following variables refer to explicit tool paths; `NPM_CLI` is that Node
installation's `lib/node_modules/npm/bin/npm-cli.js`. Use a fresh scratch path
for each run:

```sh
PACKAGE_SCRATCH=$(mktemp -d /tmp/yf-package-proof-XXXXXX)
ROOT=$(pwd -P)
BUN=/absolute/path/to/bun-1.4.3
NODE=/absolute/path/to/node-24.21.0
NPM_CLI=/absolute/path/to/npm/bin/npm-cli.js
python3 scripts/testing/offline.py "$ROOT" "$PACKAGE_SCRATCH" -- \
  "$BUN" scripts/build_npm.ts --out-dir "$PACKAGE_SCRATCH/package" \
  --version 9.8.7-test.1
python3 scripts/testing/offline.py "$ROOT" "$PACKAGE_SCRATCH" -- \
  "$NODE" tests/migration/package-pack.mjs "$PACKAGE_SCRATCH/package" \
  "$PACKAGE_SCRATCH/tarballs" "$NODE" "$NPM_CLI"
```

The pack helper runs real `npm pack --offline --ignore-scripts`, audits its
contents and modes, and writes the full `pack.json` receipt plus tarball hash
into scratch. For reproducibility, build a second new output, pack it into a
second directory, and compare tarball SHA-256 values.

Installation is a **separate network-enabled step** into an actual fresh
consumer. It never links the repository's development node_modules:

```sh
"$NODE" "$NPM_CLI" install --prefix "$PACKAGE_SCRATCH/consumer" \
  --ignore-scripts --no-audit --no-fund --package-lock=false \
  --cache "$PACKAGE_SCRATCH/npm-cache" \
  "$PACKAGE_SCRATCH/tarballs/yahoo-finance2-9.8.7-test.1.tgz" \
  @types/node@24.10.1
cp tests/migration/package-consumer.mjs "$PACKAGE_SCRATCH/consumer/probe.mjs"
cp tests/migration/package-bins.mjs "$PACKAGE_SCRATCH/consumer/bins.mjs"
```

`@types/node` is an explicit consumer TypeScript environment dependency, not a
link to development ambient types. Every verification command returns to the
strict offline guard:

```sh
python3 scripts/testing/offline.py "$ROOT" "$PACKAGE_SCRATCH" -- \
  "$NODE" "$PACKAGE_SCRATCH/consumer/probe.mjs"
python3 scripts/testing/offline.py "$ROOT" "$PACKAGE_SCRATCH" -- \
  "$NODE" node_modules/typescript/bin/tsc --strict \
  --skipLibCheck false --module NodeNext --moduleResolution NodeNext \
  --target ES2022 --lib ESNext,DOM,DOM.Iterable,DOM.AsyncIterable \
  --types node --typeRoots "$PACKAGE_SCRATCH/consumer/node_modules/@types" \
  --outDir "$PACKAGE_SCRATCH/consumer/compiled" \
  --ignoreConfig "$PACKAGE_SCRATCH/consumer/consumer.mts" \
  "$PACKAGE_SCRATCH/consumer/consumer.cts"
python3 scripts/testing/offline.py "$ROOT" "$PACKAGE_SCRATCH" -- \
  "$NODE" "$PACKAGE_SCRATCH/consumer/bins.mjs" "$NODE" "$NPM_CLI" "$BUN"
```

Run both emitted `consumer/compiled/consumer.mjs` and `consumer.cjs` under
the guard on each runtime as well. Repeat the runtime and bin probes with
exact Node 22.0.0 and Bun 1.4.3. The bin
helper accepts a fifth argument selecting a separate Node host for npm. Use
Node 24.21.0 for that npm host in every row, including Node 22.0.0 and Bun.
The child Node shebang PATH still selects the requested Node runtime. Keep Node 24.21.0 first on PATH for the Bun run's
Node-shebang children. It selects the runtime's own directory first otherwise.
The probes execute from scratch outside the checkout, use real installed
package resolution for all 28 imports/requires, compare module exports, exercise
schema validation, stubbed quote HTTP, date coercion, cookies, versioned headers,
custom clients and MCP APIs. They generate `.mts` and `.cts` consumers testing
quote overloads, chart dates, enum/interfaces, options, cookies and MCP types,
including a rejected invalid option.

Bin probes verify installed symlink aliases, modes and shebangs, help/version
with HOME absent, import safety, offline `npm exec`, and
`bun x --no-install --bun yahoo-finance2 --version`. Real packed MCP stdio
children initialize, list only allowed tools, and shut down cleanly on EOF,
SIGTERM and SIGINT while keeping cookies at mode 0600. HTTP listen is denied by
the guard and must exit predictably; this is not a real HTTP listener test.
Node 22.0.0 prints its expected experimental JSON-module warning, which the
probe permits explicitly.

The [milestone evidence](results/f01-f06-packaging.json) records exact versions,
commands and observed results. Evidence is Linux x64 only. Windows/macOS modes,
links, filesystem behavior and package execution remain unverified, as do
publisher-only Deno checks and full HTTP/Workers runtime integration.
