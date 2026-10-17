# Runtime permissions and trust boundaries

This inventory records the boundaries implemented by the migration; it does
not add a general sandbox. The library, executables and ordinary npm dependencies
run with the launching process's OS privileges. Retained Deno/JSR consumers keep
their runtime's permission model; Deno execution and publisher verification belong
to the isolated publisher. No Deno binary was invoked for this audit.

## What the former permissions covered

The former `dev` configuration's ordinary test profile allowed fixture reads,
fixture writes, six named capture-related environment variables and the five
Yahoo/query/consent hosts. Replay additionally denied network and writes. The
legacy CLI, schema/build and dedicated capture tasks used `-A`; the legacy CLI
install also requested `-A`. Those invocations already granted broad access. The
recache launcher explicitly allowed read, environment and subprocess execution.
These settings were runtime policy, not per-module privileges. Deno's
[permission documentation](https://docs.deno.com/runtime/fundamentals/security/)
explains scoped permissions, `-A`, and the independent privileges of subprocesses.
The retained `deno.json` task text is historical configuration, not authorization
to execute those commands during this migration.

| Resource | Library and installed executables | Strict Linux replay | Trusted native replay |
| --- | --- | --- | --- |
| Environment | Ambient process environment; CLI uses HOME/profile and MCP token settings. Help/version precede cookie access. | Launcher clears live/capture controls, selects replay and scratch, and otherwise inherits the trusted launching environment. This is not environment-secret isolation. | Case-insensitive capture/live/runtime-option cleanup and replay settings. Other inherited environment remains trusted. |
| Files | Library defaults use an in-memory jar; callers may supply stores. CLI/MCP use the private cookie path described below. Dependencies can access other files with process privileges. | Host tree is mounted read-only; scratch is writable. Fixture reads remain available. This deliberately permits broad host reads. | Read-only ReplayStore and before/after fixture inventory checks detect accidental fixture changes. They do not deny arbitrary writes by code with ordinary filesystem access. |
| IP networking | Ordinary fetch can reach Yahoo and follow the library's consent flow. Custom fetch/query-host options are caller-controlled capabilities. MCP HTTP can listen. No runtime host allow-list is imposed by Node/Bun launchers. | New network namespace plus inherited seccomp denial of IPv4/IPv6/VSOCK sockets and io_uring. No Yahoo traffic. | Preload rejects ordinary fetch; controlled stubs and cached responses are allowed. Direct sockets or replacing a stub are not denied by the OS. |
| Unix sockets and inherited handles | Normal process capabilities. | New Unix sockets and retargetable datagram pairs are denied. Bun subprocesses retain proven connected stream socketpairs with NONBLOCK/CLOEXEC flags. Stdio descriptors 0/1/2 remain trusted transports; extra inherited descriptors are closed. | Normal process capabilities; no portable handle or socket sandbox. |
| Subprocesses | No subprocess creation is part of a quote or MCP tool invocation in the reviewed entrypoint/library code. A caller or dependency retains normal process privileges. | Children inherit namespaces, read-only mounts and seccomp. Test deadlines and process-group cleanup are lifecycle controls, not a complete hostile-process containment claim. | Bun test orphan controls, POSIX groups and Windows taskkill provide bounded lifecycle handling. Exited-parent cleanup uncertainty is reported rather than claimed as a Windows tree guarantee. |

The strict guard requires trusted Linux kernel/user namespaces, Bubblewrap,
libseccomp, the launcher, compiler/runtime and frozen installed dependency graph.
It fails closed when unavailable. It is designed for offline replay and immutable
fixtures. Broad read access, operator-owned standard I/O, a trusted scratch
directory and trusted launcher inputs remain explicit limits. The separate
Workers helper permits only isolated loopback IP networking for Miniflare/workerd;
it retains read-only host/scratch policy and reachable pathname Unix sockets.
Neither helper is a replacement for a general untrusted-code service sandbox.
The guard masks `/run`, `/tmp` and `/var/tmp`, restoring exact selected roots,
owning checkout, private scratch and explicit runtime/tool package inputs. These
read-only closure paths are bounded canonical metadata, separate from profile
selection; whole masked roots/ancestors and arbitrary PATH-parent restores are
refused. Strict replay and repair controls use synthetic own sockets to verify
Unix/IP/VSOCK denial, low-32-bit syscall comparisons, connected inherited-FD
closure and stream-pair retargeting refusal, including subprocess inheritance.

Five exact tooling files use a separate trusted Unix-IPC profile: the launcher,
broker, child, recache runner and country CLI controls named in
`scripts/testing/inventory.ts`. New/unknown tests remain strict. This profile and
capture retain IP/VSOCK/io_uring denial while allowing Unix sockets. They are not
pathname socket allowlists: other visible host socket paths and stdio remain
trusted transport limits. Workers separately retain namespace loopback and private
Unix IPC. Its own temporary host-socket sentinel is now masked; that does not
establish isolation from every host service. No real privileged service is probed.

Native replay is an explicit trusted development command; strict Linux remains
the default replay/CI gate. Linux/macOS/Windows native assertions must be accepted
from their actual hosted artifacts. Linux evidence does not imply native ACL,
console or process behavior on another OS. Registry installation, build, docs,
release orchestration and publisher steps are separate trusted tool workloads;
ordinary frozen installation can run reviewed lifecycle hooks. The fixed fetch
preload in installed-cookie probes is a test-only finite fixture, not a security
boundary offered to library consumers.

Live recache is a separate explicitly selected capture workload. Its orchestrator
runs the offline baseline first, then uses a trusted parent fetch broker and
private Unix IPC with exact HTTPS Yahoo-host checks and manual redirect handling.
Capture workers retain the isolated/read-only host arrangement with a controlled
staging store, while the parent owns network and reviewed publication of captures.
The broker/launcher and the host remain trusted; this does not restore a general
Deno permission system. See [the capture boundary](RECACHE.md) for its separate
rate-limit, validation and interrupted-capture policies. This milestone performed
no live capture or fixture mutation.

Build and documentation commands enforce their owned-output/path policies, then
run as trusted compiler/tool processes. Documentation opening is an explicit
bounded argv-based platform-opener subprocess. Dependency lifecycle hooks and
release/publisher credentials are outside replay. Their separate invocation and
isolation policies are not implied by successful library/CLI probes.

## Cookie file integrity and persistence

The executables use `HOME/.yf2-cookies.json`; Windows can fall back to USERPROFILE
or HOMEDRIVE/HOMEPATH. HOME and its parent directories must be controlled by the
user running the command. New files use exclusive creation with mode 0600.
Existing content is preserved. Known symlinks/nonregular files are refused;
O_NOFOLLOW is used where supported, and opened/current device and inode identities
are compared. Known multiple hardlinks on initial existing, opened or current
stats are refused before chmod or constructing the path-based store. Descriptors
close after preparation; sanitized close errors retain precedence over sanitized
preparation errors. POSIX chmod failure fails preparation. Only known unsupported
Windows chmod codes are best effort; mode bits do not establish Windows ACL
privacy, especially under an administrator hosted runner.

These checks do not make an attacker-writable HOME race-free. A link can be added
or a path replaced after the checks; the third-party store later reopens the path
for persistence. The dependency is retained with a trusted-HOME assumption rather
than presented as a descriptor-only or atomic persistence implementation. Its
synchronous parser warnings are redacted at construction, but the cookie file is
still sensitive data and ordinary application/dependency code has process access.

G03 controls use real private hardlinks and links inserted between lstat/fstat
checks. They prove no target-byte/mode change and descriptor cleanup for the known
cases, not universal protection from concurrent hostile mutations. Installed
probes create the cookie through the real CLI, seed a fake crumb/A1 with the actual
installed jar, then use separate CLI, CLI, MCP `tools/call quote`, and CLI processes.
Fixed synthetic quote responses set CLI/MCP cookies, and later processes must send
those persisted cookies. The installed store is reopened for inspection, retaining
its actual on-disk format. Successful results are schema-validated by the ordinary
client; an invalid response must fail. Unrecognized fetch requests are rejected,
and initial hardlinks are refused by both executable entrypoints without changing
the synthetic target. Linux packed evidence is recorded in the
[cookie receipt](results/g03-cookie-integrity.json); actual Linux/macOS/Windows
persistence and hardlink refusals are recorded in the
[accepted native matrix](results/native-ci-8b9d42c.json). Windows regular-file
checks do not establish private owner ACLs.

## MCP request and service boundaries

The HTTP wrappers retain exact single-authority Host validation, including
ambiguous duplicate Node Host fields, before protocol dispatch. Default allowed
hosts are localhost, 127.0.0.1 and ::1. Configured Origin values are checked when
an Origin header is present; an empty or omitted `allowedOrigins` list does not
check Origin. Configured bearer tokens are required on each HTTP request.
`allowedHosts: []` explicitly disables Host checking. Those API semantics remain
unchanged; a deployment must choose its own reverse-proxy/TLS/access policy.

The CLI defaults to localhost HTTP binding. A non-local bind requires a token or
its explicit unsafe opt-out before cookie access/listen; for a deliberate
non-local binding it passes the existing empty Host list. Explicit `--token`
overrides the environment token. Startup diagnostics redact the configured token;
usage failures avoid echoing token assignments. Stdio is a trusted local-parent
transport, without HTTP authentication. Tool allow-lists limit exposed methods;
they do not isolate the process or constrain dependency privileges. The ordinary
quote/tool path does not execute a shell or arbitrary tool-supplied program.
Existing request/framing/auth/Host/Origin/protocol controls remain unchanged by
this cookie milestone. No listener, real token or remote service was used for its
persistence proof.

This is a scoped migration boundary inventory, not a dependency vulnerability
scan or a claim that every former runtime permission has a portable replacement.
Actual native and [isolated-publisher Linux Deno evidence](results/release-rehearsal.json)
are separate from this boundary audit; [REPORT](REPORT.md) records current
acceptance and exact validated heads. Ordinary-user Windows ACL privacy,
interactive console/GUI and native HTTP behavior remain qualified limits. Local
publisher verification does not prove real registry OIDC or provenance acceptance.
