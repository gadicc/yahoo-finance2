# Testing

Ordinary tests replay cached fixtures. A cache miss fails; it never enables live
capture. `setupCache()` in `tests/common.ts` owns Yahoo-response test setup.
Installation is separate from execution. Live capture requires its own explicit
workflow in [fixture capture](fixture-capture.md).

`bun run test`, `bun run test:replay` and `bun run test:coverage` default to the
maintained library tier: `src/**/*.test.ts` plus top-level `tests/*.test.ts`.
`bun run test:full` adds all maintained tooling/integration tests. CI runs
`bun run test:coverage -- --full --run-timeout 300000`. `--list` prints the
selected inventory; `--full --list` prints the complete one. Explicit focused
paths select from the complete inventory, so tooling tests remain directly
runnable without `--full`. Recache uses the maintained library tier; repair
replays that entire tier after type/schema/documentation checks.

For local iteration:

```sh
bun run test:serial -- src/modules/quote.test.ts
bun run test -- --filter quote --name 'validates|symbol'
bun scripts/test.ts --list
```

Strict replay needs Linux, Python 3, Bubblewrap, libseccomp and working user,
mount, network and PID namespaces. Missing prerequisites fail closed. WSL/VM
setups must actually satisfy them. Direct `bun test` bypasses the launcher and
is not accepted strict verification. No guard failure retries in native mode.

The launcher clears capture controls, selects replay and uses read-only host
and fixture mounts plus private writable scratch. Children inherit its boundary.
Scratch must be outside the checkout without overlap. This protects fixture
writes without checkout chmod preparation. The guard retains broad read access
and trusted host/runtime/dependency assumptions. See
[runtime security](runtime-security.md) for the precise limits.

Ordinary replay denies Unix, IPv4/IPv6 and VSOCK socket creation and io_uring.
Only demonstrated connected Unix stream socketpairs remain available; retargetable
datagram pairs are denied. The launcher masks `/run`, `/tmp` and `/var/tmp`,
restores explicit canonical input/tool closures and writable scratch, and closes
inherited descriptors numbered 3 or higher. Standard input/output/error remain
trusted transports.

Exactly five controls run in a separate trusted Unix-IPC batch:
`scripts/testing.test.ts`, `scripts/recache-broker.test.ts`,
`scripts/recache-child.test.ts`, `scripts/recache-tests.test.ts` and
`scripts/capture-get-crumb-cli.test.ts`. Unknown/new tests stay strict. The two
batches are disjoint and preserve the full selected inventory. The IPC profile
retains IP/VSOCK/io_uring denial; it is not a pathname socket allowlist. Capture
and Workers have separately authorized policies described in
[runtime security](runtime-security.md).

Paths can be repository-relative or absolute. `--filter` selects a path substring;
`--name`, `-t` and `--test-name-pattern` select native test names. Unknown flags,
missing/empty selections, empty files, only-skipped selections and zero executed
leaves fail. Inventory discovery rejects symlink selections and excludes
Workers, dependencies, fixtures and generated output. New files must be assigned
without losing existing leaves or hiding skips.

Defaults are 5000ms per test and 120000ms per whole run; explicit registrations
and bounded launcher flags select overrides. One deadline and cancellation
signal span every batch. A name filter may match only one batch, but aggregate
zero executed leaves fails. Each batch needs fresh JUnit and successful status;
unfiltered replay rejects skipped leaves. Whole-run expiry returns 124, handled
SIGINT/SIGTERM return 130/143. Process-group/orphan cleanup
is lifecycle handling, not a promise that JavaScript cleanup always runs.

Watch polls source, test and configuration contents and inventories, cancels the
current run, rediscovers files and starts a fresh child. Tests must still clean
up mocks, clocks, environment and globals. Native repeated runs retain file
globals, and a timeout need not settle a body or run `onFinish`. Restart the
supervisor after editing its own executable code or alias.

The harness retains upstream Jest assertions, bounded receiver-aware spies and
Sinon fake clocks. `projectIt` awaits bodies and ordered finish callbacks;
multiple errors remain visible. `tick` is synchronous, while `tickAsync` drains
native microtasks between timers. These adapters implement the project's used
surface; they are not general replacements for all Deno/Jest mocking APIs.

## Explicit native replay

```sh
bun run test:native
bun run test:native -- src/modules/quote.test.ts --serial
bun run test:native -- --watch
bun run test:native -- --coverage
bun run test:native -- --list
```

Native replay is trusted development on Linux/macOS/Windows. It selects all
source tests and the explicit portable harness/cache/runner controls, reports
omitted tooling and refuses explicit out-of-scope paths. It provides no kernel
network or arbitrary-filesystem denial. A preload rejects ordinary global fetch;
FMC uses a rejecting fallback and a read-only store. Direct sockets, host services
and other file APIs remain available to trusted test code.

Before/after fixture path and byte comparisons detect accidental changes,
including failed or handled aborted runs; they do not prevent writes or roll
back user work. Hard termination can bypass the final comparison. The store
rejects linked fixtures and nonportable/traversing/reserved filename IDs.

POSIX native cleanup uses a dedicated process group. Windows uses bounded
`taskkill /PID /T /F` and stream-close deadlines. Failure reports cleanup
uncertainty rather than claiming every descendant was terminated. Forced Windows
termination is not interactive Ctrl-C or guaranteed finally-hook execution.

## Coverage and integration

Coverage stages in fresh scratch and clears stale output before selection;
failed, invalid or empty runs cannot publish an old successful report. Complete
CI coverage also requires [LCOV validation](ci.md), not just passing tests.

Each raw Bun report must have canonical owned source paths, safe counters,
valid paired function totals and consistent line totals. The merger unions source
and mapped-line inventories, safely sums line hits and recomputes LF/LH. It
publishes line-only LCOV: Bun's runtime function inventories differ between
batches and LCOV omits function identities, so aggregate function counts and
percentages are unavailable, never zero or an invented union. The explicit
merged-line validator rejects function fields and keeps the complete CI
required-source gate. Native one-batch coverage preserves genuine Bun function
metrics and requires no Python.

A batch with no matched instrumented source may emit no LCOV, but still needs
fresh JUnit/status. A successful selection with no instrumented coverage leaves
the artifact absent with a diagnostic; full CI rejects incomplete source coverage.
Publication follows all batch status/JUnit/leaf, deadline/cancellation and cleanup
checks. A failed, empty, timed-out or cancelled run removes stale/partial output.
Line coverage does not establish exact statement or branch execution.

Workers run separately with their independent npm graph and isolated-loopback
launcher. See [platforms](platforms.md). Final source acceptance needs the complete
[CI](ci.md) and [migration follow-up](bun-migration.md) gates; historical passing
counts do not establish a new composed head.
