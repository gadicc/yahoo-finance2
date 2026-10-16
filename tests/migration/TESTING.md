# Maintained test commands and Linux replay boundary

On this migration branch, ordinary test commands are **replay only**. This
replaces the Deno development command's automatic live capture on a cache miss.
A missing fixture fails; there is no network or writable-fixture fallback.
Explicit live recaching remains D05 and is not enabled by these commands.

CI's intended root-test policy is the same guarded replay command, with package
installation and guard provisioning performed separately (I02). Integration
tests included in the root inventory also replay fixtures without network. The
separately npm-managed Workers integration suite remains excluded: its local
emulator/process traffic needs its own external-network-denial policy and guard
verification under H04/I02. This milestone does not claim that suite is guarded.
Future live integration/capture tests must use separately named, explicit opt-in
commands with reviewed network scope; they cannot be an automatic fallback from
ordinary or CI replay. Such live commands are not provided here (D05/H04).

Select the exact Bun version in `.bun-version`, install with the frozen root
lockfile, and install Linux Bubblewrap (`bwrap`), Python 3 and
`libseccomp.so.2`. User/mount/network/PID namespace creation must be permitted
by the host. A missing component or rejected namespace operation fails closed.
Other platforms fail with Linux/WSL guidance; D04's full platform decision
remains open. No fixture chmod preparation is needed after checkout.

```sh
bun run test:replay
bun run test:focused
bun run test:serial -- src/lib/queue.test.ts
bun run test:watch
bun run test:coverage
bun run test -- --filter quote --name 'validates|symbol'
bun scripts/test.ts --list
```

`test` and `test:replay` use the same launcher. Full runs use four isolated file
workers; bodies within a file remain serial. `test:serial` uses explicit native
file isolation. Numeric worker overrides and arbitrary Bun flags are rejected.
Use `--help` for the bounded option list. Paths can be repository-relative or
absolute, including spaces; invocation works from another working directory.
`--filter` selects a path substring, while `--name`, `-t`, and
`--test-name-pattern` select native test names using a regular expression.
Unknown options, missing files, empty selection, empty test files and a name
filter that executes no leaves return nonzero. A selection containing only
skipped tests also returns nonzero; full-suite intentional skips stay visible.

Discovery recursively scans `src`, `tests`, and `scripts` for `.test.ts`, in
sorted order. It excludes the independently managed `tests/cloudflare` harness,
symlinks, and directories named `node_modules`, `.git`, `.migration-results`,
`coverage`, `npm`, `jsdocs`, `generated`, or `fixtures`. No existing test leaves
are dropped. `--list` exposes the actual selection without launching tests.

The default per-test timeout is 5,000 ms; explicit test registrations can set
their own timeout. `--timeout MS` changes the default. `--run-timeout MS` limits
one whole guarded run (default 120,000 ms) and returns 124 on expiry. Native
test failures retain their exit code. SIGINT/SIGTERM stop the guarded process
group and return 130/143. A one-second termination grace is followed by SIGKILL.
The guarded PID namespace and Bun's `--no-orphans` prevent live descendants from
holding the run open after its parent is stopped.

Watch polls source/test/configuration contents and inventories every 200 ms. It
terminates an in-flight run on edits, then discovers files again and launches a
fresh guarded child. Added and removed tests therefore affect the next run.
Watch does not reuse a runner's module/global state and does not use soft/hot
reload. Source files with JS/TS/JSON extensions under `src`, `tests`, `scripts`
and `bin`, regular root JS/TS runtime policies (including `release.config.mjs`),
root JSON/JSONC/TOML configuration files (including TypeScript extends chains,
Bun settings and retained Deno metadata), and root lock/version files trigger
restarts. Excluded fixture/generated directories do not. Arbitrary external
configuration/extends targets outside these project watch roots are not tracked.
Removing the last selected file fails clearly. Stopping watch returns the
corresponding signal status. Watch verification checks behavior, not timing
performance.

## Guard implementation and limits

The TypeScript supervisor creates a unique per-run scratch directory outside the
repository and launches `scripts/testing/offline.py`. Scratch cannot be the
repository, inside it, or an ancestor of it. A caller-supplied TMPDIR inside the
repository is rejected before creating files. The helper requires Bubblewrap,
binds `/` and the repository read-only, provides a private minimal `/dev` and a
PID-isolated `/proc`, and grants ordinary filesystem write access only to that
scratch directory. Host `/dev/shm` is not exposed as a writable alias. It
creates fresh network/PID namespaces and a new session, with
`--die-with-parent`. Read-only mounts deny fixture truncation, append, rename,
removal, creation and chmod even when checkout permissions are writable.
Children inherit this boundary. The Python helper then installs a separate
libseccomp filter denying AF_INET/AF_INET6 socket creation and `io_uring_setup`,
including child execs, before replacing itself with the pinned Bun process.
Per-run TMPDIR points to scratch. All inherited `FETCH_DEVEL*` and `FMC_*`
variables are removed; `FETCH_DEVEL=''` and `FMC_CACHE_MODE='replay'` are then
set explicitly. The running Bun directory is first on child PATH.

JUnit output stays in scratch and lets the supervisor reject successful native
runs that execute no tests. Coverage also stays in scratch while tests run.
Afterward, the supervisor publishes only regular `lcov.info` using an atomic
replacement under the real repository `coverage/` directory. A symlink output
directory is rejected. A valid coverage attempt unlinks the previous lcov entry
before discovery/selection, including an empty or invalid file/filter selection.
Unlinking old hardlinks/symlinks does not mutate their targets. Tests never
receive a writable coverage alias to repository files. A selection with no
instrumented source reports that no coverage was generated. Scratch and
temporary publication files are cleaned on ordinary completion, failure, timeout
and handled signals; SIGKILL cannot run JavaScript cleanup. Direct `bun test`
bypasses this launcher and its boundary. Use `bun run typecheck`,
`bun run typecheck:incremental`, and `bun run typecheck:negative` for current
typechecking; see [the typechecking policy](TYPECHECKING.md). No Deno or Node
selection is required. The historical Python drivers, including
`tests/migration/run.py` and `offline.py`, and experiment configs require the
corresponding experiment checkout and dependency graph; they are not maintained
branch commands.

This is a boundary for offline replay and immutable fixtures, not a general
hostile-code sandbox. It retains broad read access and Unix sockets;
operator-supplied standard I/O redirections also remain outside fixture
protection. It does not claim protection against arbitrary malicious tests or
every host service. Bubblewrap's guarantees depend on the configured
mounts/namespaces; see the
[upstream security discussion](https://github.com/containers/bubblewrap).
Installation remains separate from test execution. Containers/native support for
other operating systems, CI package provisioning, coverage quality gates and
explicit live capture are separate milestones.

The focused regressions live in `scripts/testing.test.ts`. They use synthetic
workspaces with ordinary writable fixtures, nested guards and explicit test-only
root injection. There is no CLI/environment switch that disables the guard or
changes its root.
