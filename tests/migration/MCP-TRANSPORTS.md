# Packed MCP transports and HTTP policy (G04–G05)

The real generated npm package passes the local MCP transport checks on Linux
x64 with Node 22.0.0, Node 24.21.0 and explicit Bun 1.4.3 execution. Each runtime
hosts the probe's public-handler checks and its own packed executable children.
The consumer is a real tarball installation outside the checkout, with SDK
1.32.1 resolved from the retained public range. The root's SDK pin remains
1.32.0. No root dependency, engine, export or executable alias changed.

The focused correction is in `src/mcp/http.ts`. Previously the Host parser
accepted the first comma-separated value and any suffix after an IPv6 closing
bracket. Node also discards duplicate Host fields in `req.headers`, concealing a
second field. A real packed initialization returned 200 for comma and duplicate
Host fields; a malformed bracket suffix returned 500 on Node. The web handler
also accepted nonnumeric ports. These are concrete validation defects, without
a claim that every deployment was exploitable.

Host validation now requires one valid authority: bracketed IPv6 where needed,
no lists/userinfo/path/query, and optional numeric port 0–65535. Hostname
comparison ignores case; alternate numeric spellings such as `127.1` are not
normalized into the default allow-list. Node checks `rawHeaders` for duplicate
Host fields. Invalid Host responses keep the existing 403 JSON-RPC envelope,
with a fixed diagnostic. Origin failures also use a fixed diagnostic. Routing
uses a fixed URL base independent of Host; malformed targets receive a sanitized
400 JSON-RPC response. No new Node-only import enters the shared web handler.

The deliberate policy options remain:

- Missing `allowedHosts` uses localhost, 127.0.0.1 and ::1. An explicit empty
  array disables that application Host policy.
- Missing/empty `allowedOrigins` leaves Origin unchecked. With an allow-list,
  an absent Origin remains allowed and an unlisted present Origin is rejected.
- Bearer authentication requires the exact existing scheme/token comparison.
  Missing, wrong-scheme, wrong-length and incorrect tokens return 401.
- The executable binds locally by default. Non-local binding requires a token
  or explicit `--unsafe-no-token` before HOME/cookie access. Its intentional
  non-local mode disables the Host allow-list. A CLI token overrides the
  environment token; an empty environment token is absent.

The new `tests/migration/package-http.mjs` checks 17 groups per runtime:
stdio initialize, allowed tools, unknown-method and invalid-input errors,
JSON-only stdout, EOF/SIGINT/SIGTERM shutdown; real HTTP initialization and tool
listing; path, malformed JSON/method/Host and duplicate Host errors; local,
IPv4, IPv6, numeric-port and uppercase Host cases; explicit Origin policy;
CLI/environment token precedence and rejection; non-local safeguards and both
opt-ins; occupied-port, unavailable-bind, missing-HOME and usage errors;
listener refusal and accepted idle/incomplete HTTP connection closure after
both signals. Public-handler tools/call uses a controlled fake client. The real
executable never receives a valid data-fetching tool call. Startup diagnostics
and error responses are checked for sentinel-token leakage. Cookie creation is
observed at mode 0600; broader cookie-store/G03 and hostile-home/G06 work retain
their own scope.

The idle HTTP shutdown control first completes initialization on a keep-alive
connection, proving the server accepted it. An earlier zero-byte TCP control
exposed a Bun-specific observation: after the process had exited and its
listener refused connections, the client's local socket could still report
open. Kernel inspection found the child PID absent, no active server endpoint,
and only the client's entry. The exact runtime/kernel mechanism was not
established. The receipt retains this failure and diagnostic state. This proof
claims closure of accepted HTTP connections, not immediate EOF on every raw
TCP handshake before its first request. No executable lifecycle code was
changed to hide that distinction.

## Reproduction and boundaries

Use a private canonical mode-0700 scratch directory outside the checkout. Build
and pack with the strict default offline guard, then separately install the
actual public dependency closure from the registry, as in
[the packaging contract](PACKAGING.md). This milestone used real `npm pack`
with `--offline --ignore-scripts`; consumer installation also used
`--ignore-scripts`, since lifecycle execution is separate from this transport
proof. Add exact `@types/node@24.10.1` only for the independent declaration check.
Never link the development node_modules into the consumer.

Copy `tests/migration/package-http.mjs` beside that consumer's node_modules.
Select the runtime explicitly for both the probe and executable children:

```sh
python3 scripts/testing/workers-loopback.py "$ROOT" "$SCRATCH" \
  "$SCRATCH/consumer" -- "$RUNTIME" "$SCRATCH/consumer/probe.mjs" \
  "$RUNTIME" "$SCRATCH/runtime-result.json"
```

Run the command once with exact Node 22.0.0, Node 24.21.0 and Bun 1.4.3. The
Node shebang requirement remains Node >=22.0.0; Bun is explicit execution.
The probe's JSDoc bounds its dynamic public import to source API types for the
root semantic JS check. That type-only annotation is erased at runtime; the
copied probe resolves the actual installed package. An independent strict
NodeNext consumer checks the published HTTP declarations with
`skipLibCheck:false` and rejected numeric-token/hostname controls.

The launcher is the independently reviewed H04 loopback helper, unchanged here.
It provides private IPv4/IPv6 loopback, no external IP route, read-only host and
repository mounts, private scratch writes, cleared environment/descriptors and
zero workload capabilities. It rejects scratch hardlinks extending outside the
writable subtree. It requires a trusted operator/workload and no hostile
concurrent filesystem mutation. Visible host pathname Unix sockets remain
reachable; this is not a general hostile-code or host-IPC sandbox. See
[the full Workers boundary](WORKERS.md). The ordinary seccomp offline guard is
unchanged and remains used for builds, unit tests and typechecks. No Deno
binary, live Yahoo access or fixture recaching occurs.

The same rebuilt artifact additionally passes all eight H04 real-workerd
regressions, retaining its compatibility date and `nodejs_compat` flag. Six
focused source tests pass through `bun run test -- src/mcp/http.test.ts`.
The strict focused source/tooling and actual root tooling checks pass. All
1,201 fixture blobs match origin/dev. Exact commands, inputs, versions, package
hashes and limitations are in [the receipt](results/g04-g05-packed-mcp.json).
Independent Sol xhigh and Astra xhigh reviews cleared the frozen implementation.
The receipt records their independent protocol, authority and declaration checks;
G06 and native macOS/Windows verification remain separate gates.
This evidence covers Linux x64 local execution, without deployment or
macOS/Windows claims. G06 remains open.

The single-authority rule follows [RFC 9110 Host semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-host-and-authority).
[Node's HTTP header documentation](https://nodejs.org/api/http.html#messageheaders)
explains duplicate-header handling; raw fields are needed to detect duplicate
Host values before the discarded representation reaches policy validation.
