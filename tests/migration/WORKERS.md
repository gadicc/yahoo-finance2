# H04: generated package in real workerd

The independent `tests/cloudflare` harness runs Vitest 4.1.11 with
`@cloudflare/vitest-pool-workers` 0.22.0, Miniflare 5.20260815.0-alpha and
workerd 1.20260815.1. It keeps the existing compatibility date `2026-06-12`
and explicit `nodejs_compat` flag. This milestone changes neither that platform
target nor the public package's Node engine policy. Runtime proof is Linux x64.

All 28 generated public entrypoints load inside workerd, including the legacy
`./src/index.ts` alias, schema-backed modules, enum exports, cookies and MCP.
Eight tests exercise constructor/per-request/global fetch selection, validated
search and versioned headers, separate Set-Cookie headers with a comma in
Expires, per-request cookie isolation, split UTF-8 response streams, Date
coercion, streamed Worker output, invalid-option rejection before fetch, and
MCP web initialize/tools/list/tools/call with a controlled client. Fixtures and
Yahoo access are not involved. The finite JSON stream is an interoperability
control, not a large-response memory benchmark.

## Independent dependency ownership

This directory remains **npm-managed**, independent of root `bun.lock`. Use
**npm 10.9.9**, with Node **24.21.0** first on PATH for the tool host and normal
lifecycle scripts. Do not install the harness with Bun or silently regenerate
its lock with a different npm major.

The local `.npmrc` sets `install-links=true`. Consequently `file:../../npm`
installs a real copy of the generated package and its runtime dependency
closure. The previous directory symlink omitted those dependencies and could
only run the old core-search test using duplicated harness dependencies.
The refreshed lock replaces stale `../../npm` dnt metadata with the actual
`node_modules/yahoo-finance2` package record: four runtime ranges plus
`@types/json-schema`, no Deno shim, fetch-mock-cache or JavaScript json-schema.
The SDK is not borrowed from the repository: a cold run with the scratch
SDK removed fails to resolve `@modelcontextprotocol/sdk/server/mcp.js`.

Canonical commands run **from `tests/cloudflare`** after a fresh npm build:

```sh
/path/to/node-24.21.0 /path/to/npm-10.9.9/bin/npm-cli.js ci --foreground-scripts
/path/to/node-24.21.0 /path/to/npm-10.9.9/bin/npm-cli.js install --package-lock-only
```

Keep that Node directory first on PATH. The project setting also works with
npm 10.9.9's `--prefix tests/cloudflare`; this was checked explicitly with
`config get install-links` and a normal clean install without an extra flag.
Any future CI command must preserve the working directory or explicitly pass
`--install-links`. The old Deno task and CI wiring are not ported by H04.

The new exact development pins are TypeScript 6.0.3, `@types/node` 24.10.1 and
`@cloudflare/workers-types` 5.20260815.1. The platform type version matches the
installed pool/Miniflare generation dependency and actual workerd generation.
The pool's own `./types` only supplies testing declarations and references
platform globals; it does not install Workers runtime types. No bindings are
invented: the test augments `Cloudflare.GlobalProps.mainModule` with the actual
Worker module, as the platform types require for `exports.default`.

`npm run typecheck` checks the Worker and its tests with strict source checking,
ES2022-only library types, explicit Workers/pool/Node ambient packages and no
repository aliases. `Request<unknown, IncomingRequestCfProperties>` and
`satisfies ExportedHandler` keep the platform handler contract visible.
`skipLibCheck: true` is deliberate: without it, the pinned upstream graph has
Worker/Node duplicate ambient declarations, pool Durable Object generic errors,
and Miniflare references to unpublished internal declarations. This does not
claim those third-party declarations are clean. Source errors remain checked;
removing the invalid-option `@ts-expect-error` control fails with TS2769 against
published `SearchOptions`. The configuration loader is a Node host module and
is not part of this Worker-only source typecheck.

The scoped Miniflare overrides stay `sharp ~0.35.5` and `undici ~7.30.0`.
The dated [receipt](results/h04-workers.json) audits this separate graph rather
than extending the root B06 result. It records 191 actually installed packages,
normal esbuild/workerd postinstall execution, native version probes, licenses,
engines, peers, registry audit and exact resolved versions. No preexisting
resolved version changed, apart from replacing the local package's link record.

The registry audit reported zero advisories. npm 10's locked-tree
`ls --all --package-lock-only` reports no problems. Its **actual-tree** checker
still exits ELSPROBLEMS: three Sharp WASM-related extraneous entries also occur
in the old normal-npm10 baseline; the new real-copy graph additionally reports
Sharp/Undici invalid against Miniflare's original exact pins despite installing
the unchanged patched override versions. Removing npm's hidden lock does not
change that result. Installed versions match the committed lock and overrides,
engines all accept Node 24.21.0, and no additional peer errors were reported.
This tool discrepancy is recorded; no clean actual-tree claim or override
broadening hides it. SDK sourcemaps also warn about upstream unpublished source
files during Vite transforms, while all runtime tests pass.

## Workers-only IP loopback boundary

Ordinary tests keep using `scripts/testing/offline.py`, which denies all IPv4
and IPv6 sockets with seccomp. It is unchanged by this milestone. Miniflare and
workerd need local sockets, so they use the separate
`scripts/testing/workers-loopback.py` launcher:

```sh
python3 scripts/testing/workers-loopback.py ROOT SCRATCH CWD -- ABSOLUTE_COMMAND ARGS...
```

It requires Linux, Bubblewrap, Python 3, `/usr/bin/ip` and `/usr/bin/setpriv`.
There is no host-network or missing-prerequisite fallback. Scratch must be
outside the repository, owned by the invoking user with mode 0700 and named by a
canonical path without symlink aliases. CWD must be inside scratch. The launcher
closes inherited descriptors, replaces the environment with a small allowlist, uses scratch HOME,
XDG and temp directories, and hides host `/run` sockets. No `.env` file is copied.
It mounts the host and repository read-only, scratch writable, and creates new
user, network, PID, IPC and UTS namespaces. Namespace uid 0 maps to the invoking
host user; setup capabilities apply only inside that namespace.

Before the writable bind, a preflight walks scratch without following directory
symlinks. It counts every nondirectory entry by device/inode and compares each
count with `st_nlink`, including regular files, symlinks, FIFOs and socket inodes.
An inode with another hardlink outside scratch is rejected before the workload
runs. Multiple hardlinks fully contained in scratch remain usable, including
normal npm/native-tool layouts. The operator must own the private scratch and
prevent concurrent changes during preflight and execution. The scan is not an
atomic filesystem transaction or a defense against a hostile concurrent writer.

Setup brings up only `lo`, checks interface/route state and probes documentation
addresses for IPv4/IPv6 ENETUNREACH. The only usable routes permitted are
loopback; Linux's unreachable RTF_REJECT default entries are harmless and
explicitly distinguished. Before executing the workload, setpriv clears all
bounding/inheritable/ambient capabilities and enables no_new_privs; a fresh
interpreter verifies effective/permitted/bounding/inheritable/ambient sets are
all zero. It rechecks network state and kernel mount flags before execution.
The workload cannot reconfigure the interface. HTTP/HTTPS proxy and credential
environment variables are absent. IPv4/IPv6 loopback connections use only this
namespace; external IP routes and the host's IP localhost are unavailable.

This launcher is for trusted test code and a trusted operator. Pathname AF_UNIX
sockets on the visible host filesystem outside the hidden `/run` can still be
reached, even on a read-only mount. A disposable host Unix socket regression
explicitly demonstrates that limitation. Filesystem mount checks, inode
preflight and IP isolation do not make this a general hostile-code or host-IPC
sandbox. The broader G06 security gate remains separate and open.

Run the dedicated kernel controls directly from the launcher host:

```sh
python3 scripts/testing/workers-loopback-probe.py "$ROOT" "$SCRATCH"
```

They prove child-process IPv4 and IPv6 loopback round trips, external route
denial, read-only repository writes, scratch writes, descriptor closure,
environment clearing, zero capabilities and denied network reconfiguration.
External hardlinks of all four tested inode classes fail before workload
execution without changing the outside regular-file sentinel; wholly internal
hardlinks remain writable. The host Unix socket control succeeds as documented.
Missing tools and overlapping roots fail closed. Launching this helper inside
the ordinary strict offline guard still fails on its inherited seccomp filter;
it cannot weaken the existing guard.

## Reproducing the scratch proof

Install the root's exact Bun graph separately and choose explicit paths for Bun
1.4.3, Node 24.21.0 and npm 10.9.9. Then create a fresh outside scratch directory:

```sh
ROOT=$(pwd -P)
SCRATCH=$(mktemp -d /tmp/yf-workers-XXXXXX)
BUN=/absolute/path/to/bun-1.4.3
NODE=/absolute/path/to/node-24.21.0
NPM10=/absolute/path/to/npm-10.9.9/bin/npm-cli.js
export PATH="$(dirname "$NODE"):/usr/bin:/bin"
python3 scripts/testing/offline.py "$ROOT" "$SCRATCH" -- \
  "$BUN" scripts/build_npm.ts --out-dir "$SCRATCH/npm"
```

Copy **only** `.npmrc`, `package.json`, `package-lock.json`, `tsconfig.json`,
`vitest.config.ts`, `worker.ts` and `worker.test.ts` from `tests/cloudflare` to
`$SCRATCH/tests/cloudflare`. Installation is a separate registry-enabled step:

```sh
"$NODE" "$NPM10" ci --prefix "$SCRATCH/tests/cloudflare" --foreground-scripts
python3 scripts/testing/workers-loopback-probe.py "$ROOT" "$SCRATCH"
python3 scripts/testing/workers-loopback.py "$ROOT" "$SCRATCH" \
  "$SCRATCH/tests/cloudflare" -- "$NODE" "$NPM10" test -- --reporter=verbose
python3 scripts/testing/offline.py "$ROOT" "$SCRATCH" -- "$NODE" \
  "$SCRATCH/tests/cloudflare/node_modules/typescript/bin/tsc" \
  -p "$SCRATCH/tests/cloudflare/tsconfig.json"
```

The generated build and typecheck use the strict offline guard. Only the real
Workers runtime test uses isolated loopback. For the SDK negative control, move
its scratch installation outside the harness and move aside its scratch
`node_modules/.vite` cache, run the same runtime command and expect a missing
SDK failure, then restore both before a positive run. All modifications remain
in caller-owned scratch. The receipt includes this control, the source option
type control, actual package file hashes and verification that all 1,201 fixtures
are unchanged, with an aggregate fingerprint.

This is local workerd evidence, not a deployed Cloudflare service test, pure
Workers-without-nodejs_compat proof, or a macOS/Windows result. JSR/Deno
publication, broader runtime detection, CI integration and OS coverage retain
their separate owners.

References: [Cloudflare test configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
and [test typing and real-runtime guidance](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/).
The current documentation names the newer plugin package; this harness keeps
its installed 0.22.0 API and lock rather than silently upgrading during H04.
