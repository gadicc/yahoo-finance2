# npm package builds

Install the frozen root Bun graph, then build with:

```sh
bun run build:npm
bun run build:npm --version 9.8.7-test.1 --out-dir /absolute/new-or-empty-output
```

The builder uses root TypeScript to check production sources and emit ES2022
ESM/CJS plus declarations. It has no installation, test, network, bundler, runtime
shim or Deno step. Invoke it by absolute path from another working directory if
needed. Repository-owned source, JSON, schema and metadata inputs must be regular
owned paths, without symlink escapes. Dependency package-manager links remain a
separate trusted boundary. Foreign resolution probes are unavailable, and the
actual compiled source closure is audited against allowed roots.

All 28 public keys in `deno.json` remain, including `./src/index.ts`. Each key has
import/require and corresponding declaration conditions. ESM lives in `npm/esm/`,
CJS in `npm/script/`; CommonJS retains `require("yahoo-finance2").default`.
Relative module references become `.js` using AST-aware transforms, while ordinary
strings stay unchanged. JSON import attributes remain in ESM and are removed for
CJS. Every committed schema is copied into both formats. Executables are ESM only.

The root manifest stays private. Public npm ranges come from the retained
production mappings, with Node >=22.0.0 and Bun >=1.4.3 engines. Runtime dependencies
are tough-cookie, tough-cookie-file-store, MCP SDK and zod. `@types/json-schema`
remains a declaration dependency; the JavaScript json-schema package and
test-only fetch-mock-cache are not shipped runtime dependencies.

The explicit package allowlist includes the output trees, LICENSE, README and
`skills/`. It excludes original non-declaration TS, fixtures, tests, tool graphs,
caches, source maps and build ownership metadata. Binaries use Node shebangs and
0755 modes; other files use 0644 and directories 0755. `yahoo-finance2` and
`yahoo-finance` share the CLI target; `yahoo-finance-mcp` has its own target.
Node shebang execution needs Node >=22; Bun execution is explicit.

The default output is `npm/`. Replacing nonempty default output requires the
builder's exact regular ownership marker and recognized entries. Unmarked old
output is preserved and refused. Custom output must be new/empty and outside the
checkout, with an existing canonical parent. Linked/fixture/checkout aliases fail.
Compilation and copies finish in sibling staging before replacement; compilation
failure preserves prior output. Filesystem failure at final replacement retains
the documented limits and requires inspection.

`--version` changes the public manifest and both runtime metadata JSON files
together. Without it, source `deno.json` supplies the version. `scripts/fix_versions.ts`
delegates to this builder; it does not edit obsolete dnt output. Synthetic versions
are proof inputs, not a choice of production release version/channel.

## Verifying an installed artifact

Builder regressions run through the maintained test launcher. Real consumer
proof requires a fresh build, actual offline pack and a separate tarball install;
a root node_modules link is not equivalent. Registry acquisition is a separate
step before guarded/controlled probes. Consumer checking uses real published
declarations with `skipLibCheck:false`; build-time third-party checks retain the
project's `skipLibCheck:true` policy.

Check all public ESM/CJS exports, declarations and negative option controls,
schemas, custom fetch, date coercion, cookies, versioned headers, MCP and installed
CLI aliases on selected runtimes. Probe help/version/import safety without HOME
or Yahoo traffic. HTTP listeners use their own loopback controls, not weakened
strict replay. Fixture hashes/modes, tarball bytes and exact runtime versions bind
each proof. [Platforms](platforms.md) owns native and Workers scope.

Maintained installed-artifact/CLI/Workers probes belong under `tests/package/`;
shared assertion/mock/time/test adapters belong under `tests/helpers/`. The build
and runtime drivers invoke these maintained probes with real installed package
roots; historical benchmark drivers are preserved only in the Git archive.

Publication is separate. [RELEASING](RELEASING.md) owns initial prebuild ordering,
Node/npm publisher policy, provenance and partial-release recovery. The
[publisher contract](../scripts/publisher/README.md) owns JSR staging, exact private
pins/auxiliary lock and isolated Deno. npm caret ranges and JSR exact pins are
intentional different distribution contracts. Passing builds never authorizes
publication or proves registry identity.
