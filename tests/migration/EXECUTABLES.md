# Portable executable source phase (G01–G03)

Both `bin/yahoo-finance.ts` and `bin/yahoo-finance-mcp.ts` now use
Node-compatible APIs for arguments, environment, filesystem operations, streams,
terminal state and exit status. They have portable `#!/usr/bin/env node`
shebangs for generated JavaScript and executable source modes. Invoke TypeScript
source explicitly with Bun. Both preserve their existing `deno.json` metadata
imports and the published Node 22.0 minimum policy. The accepted H02 decision
retains JSR distribution and Deno consumer compatibility at the existing Deno
2.0.0 minimum. Development, tests and builds use Bun/Node; a Deno binary may be
owned only by the isolated publisher. Publication implementation and
compatibility proof remain J01/H03/H05.

The shared `bin/runtime.ts` helper must be included by the future package build.
Its main guard compares real paths, allowing direct entrypoints and executable
symlinks from another working directory while keeping imports free of client,
cookie and transport startup. Source help/version paths require no HOME, cookie
file or network. The source CLI keeps usage/runtime exit codes, UTF-8 stdin,
terminal inspection and JSON-only piped stdout; diagnostics remain on stderr.
Exit status is assigned instead of forcing process termination, allowing output
to flush. The adapter accepts explicit client/I/O dependencies for controlled
source tests; production defaults create the ordinary Yahoo Finance client.

Cookies retain the `HOME/.yf2-cookies.json` location. Windows can fall back to
USERPROFILE or HOMEDRIVE/HOMEPATH when HOME is absent; POSIX missing HOME stays
an error. Files are created with exclusive `O_CREAT|O_EXCL` and mode 0600, so
there is no creation interval with permissive mode bits, including under umask
000. Existing files are never truncated. Descriptor-based mode enforcement sets
0600; POSIX chmod failures fail closed. Windows unsupported mode operations are
explicitly best effort for ENOSYS/ENOTSUP/EOPNOTSUPP/EINVAL; this does not claim
POSIX modes establish Windows ACL privacy.

Existing symlinks, nonregular files and known multiple hardlinks are rejected
before chmod/store construction. Opened/current link counts and identities are
checked; this does not prevent links added after those checks in an attacker-owned
HOME. O_NOFOLLOW protects opens
where available, and descriptor/path identities are checked. Nonblocking opens
avoid waiting on a substituted FIFO. Descriptors close on success and failure;
all preparation/load errors use fixed messages. The pinned file-store's
synchronous constructor can log raw malformed cookie objects/domain text, so
`loadAsync:false` loading has a bounded warning-redaction boundary that restores
`console.warn` in `finally`. Its warning reports an unreadable entry without
cookie contents. User-owned HOME remains the trusted directory; subsequent
cookie persistence is still supplied by the existing path-based file-store.

The MCP source uses the same CLI option defaults, token precedence, transport
selection and localhost policy. Non-local HTTP startup requires a token or the
explicit unsafe opt-out before cookie access or listen. Its existing source
Host/Origin/token handler logic is unchanged. HTTP listen failures are caught,
produce a fixed stderr diagnostic and exit 1. Unknown-option diagnostics do not
echo `--token=value`, and configured tokens are redacted from startup errors. Later server errors close HTTP
connections and set a failing status. SIGINT/SIGTERM close resources and remove
listeners; stdin EOF closes stdio transport. Shutdown failures cannot be
silently overwritten by a later successful startup status. The real source stdio
child completes initialize and tools/list with an allow-list, then exits cleanly
on EOF, SIGTERM and SIGINT without fetching Yahoo data.

`tests/cli-entrypoints.test.ts` supplies fourteen meaningful regression cases,
including real children outside the checkout, symlinks, import safety, usage and
stdin errors, controlled successful JSON output, TTY routing, split UTF-8,
initial creation mode, existing contents/modes, rejected file types, chmod and
descriptor cleanup, six concurrent creators, warning/error redaction and MCP
startup/protocol/shutdown. The included tests import both entrypoints and the
helper, bringing their bodies into the existing full TypeScript check without
changing its shared configuration.

The separate guarded [Python standard-library PTY probe](cli-pty-probe.py) runs the source adapter
with a fake client and its default terminal detector. A real Linux PTY reports
`isTTY` true and produces inspection output; a pipe reports false and produces
valid JSON. Neither path requires HOME or Yahoo access. This is real Linux PTY
evidence, distinct from the injected TTY unit control; Windows terminals remain
unverified.

[Evidence](results/g01-g03-source-cli.json) records the isolated base plus only
this source milestone, clean frozen install, offline tests/typechecks and 1,201
unchanged fixture hashes. Node 24.21.0 source help/version/import probes pass;
Node 22.13.0 source probes pass with its explicit experimental stripping flag
and expected warning. Those optional TypeScript source modes do not raise the
published Node 22.0 engine requirement.

G02's CLI behavior is verified by these source invocation and PTY controls.
G01/G03 remain partial source implementation and Linux evidence: packed
executable aliases, npm exec/npx and package contents still need F/G
verification. Real
Windows/macOS filesystem and ACL behavior remain unverified. HTTP sockets and
Yahoo access stay denied during these tests; packed HTTP and SDK integration
remain G04. CLI data success uses an injected fake client. No generated npm
output, dependency versions, consumer metadata, CI, fixtures or shared library
source changed in this phase.

The later G03 cookie milestone adds actual packed CLI/MCP quote persistence and
hardlink/race controls. See [cookie integrity evidence](results/g03-cookie-integrity.json)
and the [G06 trust-boundary inventory](TRUST-BOUNDARIES.md). Those distinguish
Linux proof, pending native OS execution, trusted HOME and Windows ACL limits.
