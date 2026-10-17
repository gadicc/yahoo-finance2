# Runtime permissions and trust boundaries

Library code, executables and Node/Bun dependencies run with the launching
process's OS privileges. Deno/JSR consumers retain their runtime's own permission
model. Removing Deno development tooling does not provide portable permission
parity or a general untrusted-code sandbox.

## Replay, capture and tooling

Strict replay is Linux-only and fails closed. It keeps repository/fixtures
read-only, grants private scratch writes and inherits its namespaces/seccomp
boundary into children. Host/runtime/dependency trust, broad read access and
operator-supplied standard I/O remain explicit limits. Ordinary test environment
cleanup prevents inherited capture settings; it is not a general secret boundary.

Strict replay/repair deny Unix, IPv4/IPv6 and VSOCK socket creation plus
io_uring setup, comparing the kernel-consumed low 32 bits of socket families.
Retargetable Unix datagram socketpairs are denied. Bun's demonstrated connected
Unix stream pairs may use only stream type and NONBLOCK/CLOEXEC flags; synthetic
controls prove these connected pairs cannot retarget a pathname sentinel.

Common host socket directories `/run`, `/tmp` and `/var/tmp` are privately masked.
Exact canonical selected/owning checkout, runtime files and explicitly required
tool-package subtrees are restored read-only, with private scratch writable.
Nested launchers carry only validated read-only closure metadata; masks and
ancestors cannot be restored wholesale. No whole PATH parent is restored just to
reach a binary. Descriptors 3 and higher are closed, including connected synthetic
sentinels; standard descriptors 0/1/2 are trusted operator transports.

The exact five-file [IPC-control batch](testing.md) is an explicit trusted
launcher choice, never an environment-selected fallback. Unknown tests stay
strict. A child cannot relax inherited seccomp restrictions. These controls do
not claim complete hostile-code confinement, secret isolation or removal of
other trusted host/runtime/dependency surfaces.

[Native replay](testing.md#explicit-native-replay) is explicitly trusted. Its
read-only cache and rejecting ordinary fetch fallback do not deny arbitrary
socket or filesystem APIs. Fixture comparison detects changes rather than
preventing or rolling them back. Cleanup uses bounded platform lifecycle controls;
forced termination/crashes can prevent final comparisons and finally hooks.

Capture is a separately authorized trusted workload: the parent broker owns
network and validated publication; child facades use private Unix IPC and staging.
Exact Yahoo host/redirect/pacing/429 checks and minimal child environment are in
[fixture capture](fixture-capture.md). They do not sandbox arbitrary host services.

Capture explicitly selects the Unix-enabled IPC profile while retaining
IP/VSOCK/io_uring denial in its children. It uses the same masked common paths
and exact restored closures. Other Unix socket paths visible through the host or
restored inputs remain reachable by trusted IPC code; this is not a pathname
socket allowlist. Standard I/O remains trusted. Workers separately permit their
private namespace loopback and private scratch Unix sockets, mask common host
socket directories and retain the same visible-other-path qualification. Their
loopback launcher cannot weaken an inherited strict replay policy.

Build, docs generation/opening, dependency hooks and release/publisher work remain
separate trusted tools with their own path/output/credential policies. Installation
may execute reviewed lifecycle hooks; successful replay is not an isolation claim
for those workloads. [Schema repair](schema-repair.md) retains trusted parsing,
exact input closure and fresh verification/publisher separation.

## Cookie files

The CLI/MCP use `HOME/.yf2-cookies.json`; Windows falls back to USERPROFILE or
HOMEDRIVE/HOMEPATH. Help/version precede cookie access. HOME and parents must be
controlled by the invoking user. New files use exclusive creation with mode 0600;
existing content is preserved. Known symlinks, special files and multiple hardlinks
are refused before chmod or path-based store construction. Opened/current inode
and link-count checks plus O_NOFOLLOW where available cover observed aliases.
Descriptors close on success/failure; preparation, load and close errors use fixed
messages, with close failure taking precedence. Dependency parser warnings are
redacted at synchronous construction.

POSIX chmod failure stops preparation. Only known unsupported Windows chmod
errors are best effort; POSIX mode bits do not establish Windows ACL privacy.
Checks are not race-free against attacker-owned HOME: links/replacement can occur
after checking, and the third-party store later reopens a pathname. Cookie content
remains sensitive to code with process access. Do not describe this as an atomic,
descriptor-only persistence design.

## MCP HTTP and stdio

HTTP handlers validate one Host authority before protocol dispatch: no lists,
userinfo/path/query or malformed bracket suffix; optional numeric ports are
0–65535. Hostname comparison ignores case, without normalizing alternate numeric
spellings into the allowlist. Node inspects raw headers for duplicates. Invalid
Host and configured Origin failures return fixed 403 JSON-RPC diagnostics. Node
routing uses a fixed URL base independent of Host; malformed targets get fixed 400
errors. These checks do not mean every protocol/server error is sanitized.

Default allowed hosts are localhost, 127.0.0.1 and ::1. Explicit `allowedHosts: []`
disables Host checking. Missing/empty allowedOrigins leaves Origin unchecked;
with a list, absent Origin remains allowed and an unlisted present Origin fails.
A configured bearer token is required on each HTTP request. Reverse-proxy/TLS
and deployment access policy remain the deployer's responsibility.

The executable binds locally by default. A non-local HTTP bind needs a token or
explicit `--unsafe-no-token` before cookie access/listen; deliberate non-local
mode uses the existing empty Host list. CLI token overrides the environment.
Unknown-option diagnostics avoid echoing assignments and configured startup
tokens are redacted. Listen failures use fixed messages; shutdown closes accepted
HTTP connections. No immediate EOF guarantee is made for every raw idle handshake.

Stdio trusts its local parent and has no HTTP authentication. Tool allowlists
limit exposed methods without isolating the process/dependencies. The ordinary
quote/MCP tool path does not execute a shell or tool-supplied program. Source
help/version are offline; CLI data commands can contact Yahoo.

See [platform qualifications](platforms.md), [release guidance](RELEASING.md) and
the [publisher contract](../scripts/publisher/README.md) for separate native ACL,
interactive console, isolated Deno and registry/provenance limits.
