# Consumer runtime policy and verification (H01/H03)

Consumer minimums remain **Node 22.0.0, Bun 1.0.0 and Deno 2.0.0**.
The Bun 1.4.3 development pin is independent. Minimums apply to upstream-supported
OS/runtime combinations; Bun 1.0 predates native Windows binaries. npm and JSR distribution remain
required. The constructor preserves its existing behavior: unsupported hosts or
versions produce a logger warning; construction is not rejected.

| Consumer | Retained policy | Actual evidence in this step |
| --- | --- | --- |
| Node | >=22.0.0; upstream Linux/macOS/Windows platforms | Exact 22.0.0 and 24.21.0 on Linux x64 |
| Bun | >=1.0.0; upstream Linux/macOS/Windows platforms | Exact 1.0.0 and development 1.4.3 on Linux x64 |
| Deno | >=2.0.0; retain JSR and npm consumers | Simulated globals and official 2.0 source inspection only; actual execution remains publisher-owned |
| Cloudflare Workers | Existing nodejs_compat configuration, compatibility date 2026-06-12 | Local workerd 1.20260815.1; existing independent locked harness and generated installed package |

These Linux results do not establish native macOS/Windows coverage. Consumer
support is retained; H05 must exercise the actual supported OS paths. The user
selected native replay for trusted macOS/Windows development while retaining
the strong Linux guard in CI. The explicit `bun run test:native` implementation
is now available; its [policy and evidence](NATIVE-REPLAY.md) distinguish the
read-only cache boundary from process isolation. Actual native OS execution
remains pending. The strict default requires Linux namespaces, Bubblewrap,
Python 3 and libseccomp and fails closed if they are unavailable. A WSL or VM
environment must actually satisfy those prerequisites.


A Deno binary is permitted **only inside the isolated publisher**. None was
invoked for this work, including tests, development, builds or formatting.
Deno-shaped globals and inspection of the official Deno 2.0 implementation of
`process.versions.deno` are detection controls, not actual Deno compatibility or
terminal proof. That H03 portion remains open until publisher verification.

## Runtime selection and terminal behavior

The runtime global is `globalThis`; incidental `self` and `global` objects cannot
hide the host. Workers detection requires callable `WebSocketPair` and a cache
object, together with the Workers user agent or workerd's observed `argv0`.
The existing feature heuristic remains available without other runtime version
signatures. This accommodates Workers' real Node compatibility process while
rejecting a Workers user-agent string alone on Node.

Bun and Deno take precedence over their own matching Node compatibility
versions. An incidental `Bun.version` or `Deno.version` object does not override
Node when its corresponding `process.versions` entry is absent or mismatched.
These are compatibility heuristics over mutable globals, not a security
identity check. The helpers are internal; they are not package export subpaths.

Versions use complete major.minor.patch syntax, optional `v` and build metadata,
and SemVer prerelease ordering. Missing/malformed versions fail closed instead
of comparing equal. Numeric prerelease identifiers compare numerically,
including values beyond JavaScript's safe integer precision.

Optional global/property accessors and proxy traps that throw are treated as
unavailable APIs. A Node host without Bun/Deno compatibility version markers
never needs their candidate version getters. Workers are identified before
unrelated Bun/Deno candidates are inspected. A disabled latest-package check
(`versionCheck: false`) preserves these constructor guarantees.

Terminal routing uses Node/Bun `process.stdout.isTTY` only for those hosts and
Deno's bound `stdout.isTerminal()` only when Deno is selected. Workers, unknown
hosts and unavailable terminal properties or calls use nonterminal logging. A Deno shim
cannot force colors or throw through Node/Bun construction.

## Evidence and reproduction

The [receipt](results/h01-h03-runtime.json) identifies the exact source snapshot,
package hash, runtime provenance, commands, results and remaining limitations.
Source verification uses immutable base `acc62e8` plus this step's exact files;
it excludes the concurrent B04 checker/graph and Biome drafts. Supplemental
combined-root checking is identified separately.

The focused source suite has twenty-one runtime tests plus the existing twelve
constructor tests. It evaluates the actual small runtime modules in isolated
VM contexts because Bun's own `Bun` global is immutable. Constructor integration
changes only configurable globals synchronously and restores their property
descriptors. Old-source negative controls fail the shadowed-global, incidental
Bun, malformed-version and prerelease regressions.

A fresh package is built and packed under `scripts/testing/offline.py`, then
installed into a separate real consumer with public dependencies. Installation
is the separate registry-enabled step; runtime probes return to the strict
offline boundary. All 28 public exports, ESM/CommonJS, controlled quote/date
coercion/validation/cookies and MCP APIs pass on the four tested Node/Bun
versions. Old Bun's asynchronous `import.meta.resolve` needs `await` in the
existing disposable consumer probe; no package change is needed.

Copy [package-runtime.mjs](package-runtime.mjs) beside that installed
`node_modules`, then run it with each explicit Node/Bun binary under the strict
guard. Pass `pipe` for piped stdout and `tty` when stdout is attached to a real
PTY. The eight Linux pipe/PTY rows verify host/version detection, supported
construction without warnings, incidental globals and structured/plain logger
routing, including throwing global/candidate getters and proxies. Node 22's existing JSON-module experimental warning remains on stderr.

For Workers, reproduce the fresh generated package and independent npm 10.9.9
installation described in [WORKERS.md](WORKERS.md), then run the existing eight
runtime tests. Copy [workers-runtime.mjs](workers-runtime.mjs) into private
outside scratch and invoke it with the harness directory through
`scripts/testing/workers-loopback.py`. It loads the actual installed generated
runtime helpers inside workerd and checks Node compatibility, an incidental
throwing Deno version/terminal getters and a missing navigator. All three detect Workers,
pass policy and use nonterminal logging. This is local workerd evidence with
nodejs_compat; it is not a deployed service or pure Workers proof.

The official [Bun 1.0 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.0.0)
Linux x64 download was checked against its release `SHASUMS256.txt`, with version
and revision verified before use. No global runtime was changed. Runtime
selection is informed by Cloudflare's [navigator.userAgent contract](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#navigatoruseragent)
and [process compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/),
and the pinned [Deno 2.0 process source](https://github.com/denoland/deno/blob/v2.0.0/ext/node/polyfills/_process/process.ts).

Independent Sol xhigh fix review and Astra xhigh full review cleared this
implementation after the incidental getter/proxy regression was repaired. The
old installed package fails the supplied detection/terminal/constructor probe
on all four Node/Bun versions; the fixed package passes. Astra additionally
checked 348 property failures, 10,036 SemVer comparisons and 32 constructor
cases, rebuilt all 252 package files, and reran the real workerd checks. These
reviews accept H01 policy and the bounded Linux portion of H03; actual publisher
Deno and native OS verification remain open.
