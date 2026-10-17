# Consumer runtimes and platform checks

Consumers require Node >=22.0.0, Bun >=1.4.3 or Deno >=2.0.0 on platforms
supported by those runtimes. The Bun consumer floor is a separate policy from
the exact Bun 1.4.3 development pin. JSR and npm distribution remain supported.
The constructor warns on unsupported runtime/version and continues; warnings do
not make an older runtime supported. The internal consumer policy also owns
npm Node/Bun engines and minimum-runtime proof selection.

Runtime detection uses `globalThis` and checks Workers capabilities/host markers
before Node compatibility globals. Incidental Bun/Deno objects cannot override
a mismatching Node host. Missing or malformed versions fail the support check;
complete major.minor.patch, SemVer prerelease order and build metadata are handled.
Throwing optional getters behave as unavailable APIs. These mutable heuristics
are not security identity checks. Terminal logging uses only the selected
runtime's terminal API and defaults to nonterminal when unavailable.

## Native Linux, macOS and Windows

The native workflow uses x64 `ubuntu-24.04`, `macos-15-intel` and `windows-2022`,
with Node 22.0.0, Node 24.21.0 and Bun 1.4.3 consumer rows. Source replay is
explicit trusted [native mode](testing.md#explicit-native-replay), with an
omitted-tooling inventory and fixture parity checks. It does not substitute for
strict Linux CI or deny arbitrary raw sockets/filesystem access.

The driver runs clean installation, replay and package phases using one owned
canonical results directory outside the checkout. Install requires absent
node_modules, a fresh download cache, normal frozen hooks and actual toolchain
success. Ordinary verification tool versions derive from root devDependencies;
installed Biome must match the exact root pin. Results record the actual installed
manifest tree, distinct from the installer's package count.

Replay runs native parallel, serial and coverage inventories plus explicit
portable path/framing controls. Each inventoried file must pass with zero skips
and failures. Native coverage validates nonempty lines, source
bounds, safe/coherent totals and runtime/quote/chart/public-enum sentinels.
Package phase builds and packs a real artifact outside the checkout, installs it
into a separate consumer with spaces, then checks every public ESM/CJS export,
real declarations, CLI aliases, runtime detection, cookies and MCP stdio.
Registry installation is separate from controlled runtime probes; no Yahoo data
request is needed for these checks.

POSIX proves executable links/modes and cooperative signal behavior. Windows uses
its actual npm shims, USERPROFILE fallback and bounded forced termination.
A held-stdio exited-parent control reports uncertainty where tree cleanup cannot
be established. Fragmented UTF-8 newline MCP frames must decode without treating
partial tails as complete messages. Missing/invalid frames and unfinished final
frames fail the probe.

Actual native evidence is commit-specific. Historical rows are preserved in the
[archived native guide](https://github.com/gadicc/yahoo-finance2/blob/701f137d05f861b7a046618ca08321dcbba2ce9e/tests/migration/NATIVE-PLATFORMS.md)
and [archived acceptance tracker](https://github.com/gadicc/yahoo-finance2/blob/701f137d05f861b7a046618ca08321dcbba2ce9e/tests/migration/REPORT.md).
They do not establish the new follow-up head. Windows private ACLs, interactive
console/Ctrl-C, native HTTP listener and GUI opener equivalence remain qualified
limits; Linux success is not proof of those native behaviors.

## Cloudflare Workers

Workers retain the independent npm 10.9.9 graph, Node 24.21.0 tool host,
`nodejs_compat` and compatibility date `2026-06-12`. The root checker does not
substitute Node declarations for Worker source types. Never install the harness
with Bun or regenerate its lock with a different npm major.

```sh
python3 scripts/ci.py workers --bun /absolute/bun-1.4.3 \
  --node /absolute/node-24.21.0 --npm /absolute/npm-10.9.9/bin/npm-cli.js
```

This maintained gate privately builds the package, copies the seven canonical
harness files including `.npmrc`, performs normal npm acquisition separately,
then runs denied-network source types and isolated-loopback runtime controls.
`install-links=true` makes `file:../../npm` a real package copy with its own
runtime dependency closure; it must not borrow the root SDK.

Workerd checks all 28 entrypoints plus fetch selection, schema/date coercion,
cookies, streaming and MCP web behavior using controlled responses. The graph's
`skipLibCheck:true` qualifies upstream declaration conflicts while strict source
errors and negative option checks remain mandatory. Existing Sharp/Undici
overrides remain independent. The historical npm10 actual-tree ELSPROBLEMS
qualification is retained in the archived Workers guide; no clean actual-tree
or advisory-free claim is inferred for a new install.

The separate loopback helper needs Linux/Bubblewrap/iproute2/util-linux. It clears
credentials and extra descriptors, stages private scratch and rejects inode
hardlinks extending outside it. It permits only its namespace's IPv4/IPv6
loopback, with no external routes or host IP localhost, then drops capabilities
and sets no_new_privs before workerd. Builds/types still use the strict guard.

The launcher masks `/run`, `/tmp` and `/var/tmp`, then restores exact owning
checkout, runtime and explicit npm package subtrees, even when all lie under temp.
Private scratch Unix sockets remain available. A synthetic host-temp sentinel is
masked rather than reachable. Unix endpoints at other visible host/restored paths
and operator standard I/O remain trusted; this is not a pathname allowlist or a
general host-IPC sandbox. An inherited strict replay policy cannot be weakened by
starting this helper.

## Deno and publisher verification

Deno >=2.0.0 remains a source/JSR and npm ESM consumer target. Deno may execute
only inside the isolated publisher, including its explicit compatibility
rehearsal; ordinary contributor tests/builds/docs do not invoke it. Minimum Deno
and pinned publisher Deno have distinct source and installed-consumer type/runtime
checks, with precise SDK type negatives. Do not infer Deno CommonJS, native Windows
terminal or actual registry/provenance acceptance from those Linux ESM proofs.
See the [publisher contract](../scripts/publisher/README.md) and
[release guide](RELEASING.md), which remain the operational authorities.
