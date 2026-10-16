# B06 dependency audit — 2026-10-16

Audited the private Bun migration workspace at base `e4baf3b`, with Bun 1.4.3,
20 exact development dependencies and four exact runtime dependencies. The
independently npm-managed Workers harness and prospective Biome addition are
outside this checkpoint. No dependency updates or overrides were made.

## Clean installation and actual graph

A disposable `/tmp/yf-b06-clean-install` copy of `package.json`, `bun.lock`,
`.bun-version`, and `scripts/check-toolchain.mjs` installed with ordinary
`bun install --frozen-lockfile`, with Bun 1.4.3 and Node 24.21.0 selected in
PATH. No `--ignore-scripts` or trust bypass was used. After removing only that
disposable installation's own `node_modules`, the repeat installed 442 packages
and executed the root preinstall toolchain guard successfully. The lock SHA256
remained `e3c9ff314073f17024f15a6ad2d7c59c6b3f8bce2415e3731f92ed27e522e499`.
A separate guard invocation under Node failed with the expected Bun-version
error. `bun pm untrusted` reported zero untrusted dependencies.

Installed manifests contain 612 package instances, 565 unique name/version
pairs, 19 peer constraints and 464 Node engine declarations. Package-relative
peer resolution found no unsatisfied required or installed optional peers;
all declared Node ranges accept 24.21.0. This is manifest compatibility, not
proof every tool executes under Bun. The earlier existing-worktree audit
covered only 552 unique installed versions matching the lock, and is superseded
by this clean actual-graph inventory.

There are no dependency preinstall/install/postinstall scripts, `binding.gyp`
files, `gypfile` declarations or OS/CPU-specific packages in this installation.
The root preinstall intentionally checks the selected toolchain. Four optional
pure-JavaScript dependency edges remain: cli-table3 to @colors/colors,
handlebars to uglify-js, jsonfile to graceful-fs, and minipass-fetch to
iconv-lite. Former esbuild, Rollup and LZMA packages observed in the older
worktree installation are absent from the clean graph.

### npm bundled dependencies

Bun's lock-driven license command warns about four absent virtual lock versions:

| npm dependency | Virtual lock version | Actual bundled version |
| --- | --- | --- |
| @sigstore/protobuf-specs | 0.5.2 | 0.5.1 |
| binary-extensions | 3.2.0 | 3.1.0 |
| minipass-flush | 1.0.7 | 1.0.6 |
| socks | 2.8.10 | 2.8.9 |

These differences reproduce on the clean frozen install. They are not missing
platform dependencies or evidence of a modified installation. The official
[npm 11.21.1 archive](https://registry.npmjs.org/npm/-/npm-11.21.1.tgz) has SHA512
`YTzL6QBEJXyHcTu0JiUc7RKMp+mzlJtl7rGLmERaXUQeFHIMc9atdr6G9M9C8vDWbv40epoTQAzNL2/PtZVDhQ==`,
matching both registry metadata and the lock's npm integrity. All 143 installed
npm bundled package manifests match that archive byte for byte. All 13 actual
name/version pairs absent from the virtual lock's version set are among those
verified bundled manifests. The parent npm archive therefore pins their bytes;
no dependency override or manual bundle repair is warranted. The audit below
submitted actual installed versions, including these bundles.

## Advisories and reachability

The official npm bulk advisory endpoint was queried successfully for all 565
actual installed versions. It returned the same two advisories as Bun's initial
lock-driven audit. Both official advisory pages report **no patched version**.

| Dependency and advisory | Actual path and impact | Decision |
| --- | --- | --- |
| braces 3.0.3, high [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | semantic-release 25.0.9 and @semantic-release/commit-analyzer 13.0.1 → micromatch 4.0.8 → braces 3.0.3. Deeply nested patterns can exhaust the stack. `semantic-release/lib/branches/expand.js:11` takes branch patterns from repository configuration; commit-analyzer's `lib/analyze-commit.js:27` takes patterns from release rules, with commit data as matched subjects. | Record unpatched release-tool risk. Current `release.config.mjs` supplies bounded repository-owned patterns. No Yahoo, library or MCP payload supplies these patterns. Track the upstream advisory through the release-tool owners; do not invent a patched version or change release semantics solely to clear audit output. |
| sprintf-js 1.1.3, moderate [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | Direct development dependency; only active source import is `tests/migration/runner.ts:2`, formatting test names at line 70. Unbounded precision in an attacker-controlled format string can throw. | Record bounded test-tool risk. Format strings are repository-owned test labels; row data supplies values. Preserve the `it.each` label contract and track upstream. No shipped runtime import. |

No production exposure to these two advisory inputs was identified. This is a
dated dependency audit, not a claim that development dependencies have zero
advisories or that every possible future configuration remains safe. No
publisher or exploit payload was executed.

## Licenses and ownership

Every actual installed package manifest declares license metadata. The clean
inventory covers all 565 unique versions, including npm bundles; Bun's
lock-driven license list alone omits the four virtual-version discrepancies.
The graph uses MIT, ISC, Apache-2.0 (also a legacy `Apache 2.0` spelling),
BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, 0BSD, CC0-1.0, and permissive
multi-license expressions. Tooling exceptions include npm's Artistic-2.0,
argparse's Python-2.0 and spdx-exceptions' CC-BY-3.0. This inventories declared
metadata; full license-text attribution and distribution review are separate.

The direct ownership map in [DEPENDENCIES.md](DEPENDENCIES.md) remains valid;
no direct dependency was proven unused. Runtime cookies and MCP packages remain
separate from assertions, timers, fixture tooling, schema generation, TypeScript
and release tooling. `@types/json-schema` is declaration-only, and must remain
resolvable by declaration consumers. `fetch-mock-cache` remains test-only;
packed-artifact verification owns proving it does not enter the shipped package.

`@sebbo2002/semantic-release-jsr` 4.0.2 uses `jsr` 0.14.3. Publisher
`verifyConditions` (including dry-run) and `publish` may download and execute
Deno. The installed `jsr/dist/deno_version.js` pins Deno 2.6.7; release downloads
from `dl.deno.land/release` are SHA256 checked in `dist/download.js`. This is
consistent with the retained binary-publisher-only Deno policy, and is not an
installation hook. No Deno binary or publisher was invoked.

## Reproduction and limits

Copy the four bootstrap inputs listed above into a new disposable directory,
then run with the pinned binaries selected:

```sh
bun install --frozen-lockfile
bun run check:toolchain
bun pm untrusted
bun pm licenses --json
bun audit --json
```

For the actual-graph audit, recursively inventory each installed package and
nested `node_modules` manifest, deduplicate name/version pairs, then POST the
`{packageName: [versions]}` JSON map to
`https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`. This captures
npm's actual bundled versions as well as the virtual lock graph. Compare the
npm archive SHA512 to its lock integrity and compare bundled package manifests
to the archive before attributing version differences to installation drift.
Summary receipt hashes are in
[results/b06-dependency-audit.json](results/b06-dependency-audit.json).

Only Linux x64 installation was exercised. B05 remains open for supported
operating-system coverage and CI lifecycle verification. No full suite, live
Yahoo traffic, fixture writes, Deno execution or publication was performed.
