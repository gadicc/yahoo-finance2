# Explicit native replay for trusted development

`bun run test:native` runs the library and portable harness controls directly
with pinned Bun 1.4.3, without requiring Linux, Python, Bubblewrap or libseccomp.
It is an explicit development choice. `bun run test`, `test:replay`, the other
existing aliases and strict Linux CI retain their guarded default. A guard
failure never retries in native mode. No environment variable selects native
mode; use the command or `--native` explicitly.

```sh
bun run test:native
bun run test:native src/modules/quote.test.ts --serial
bun run test:native --filter quote --name 'validates|symbol'
bun run test:native --watch
bun run test:native --coverage
bun run test:native --list
```

This is trusted replay, not an OS sandbox. Ordinary global fetch is replaced
before test imports, capture/live environment controls are cleared and FMC uses
an offline fallback plus a read-only store. Test-controlled fetch stubs and
synthetic transports remain available. Arbitrary test code can still use raw
sockets, other HTTP clients, filesystem APIs and host services. Do not use this
mode to evaluate hostile tests or claim strict CI network/write denial.

## Inventory and selection

Native discovery includes every discovered `src/**/*.test.ts` and these explicit
portable controls:

- `tests/harness.test.ts`
- `tests/recacheFetch.test.ts`
- `tests/recacheStats.test.ts`
- `tests/replayStore.test.ts`
- `scripts/native-replay.test.ts`

The helper regressions create disposable synthetic workspaces. Recache-fetch
controls use synthetic transports; they do not contact Yahoo or capture real
fixtures. Source additions enter the native inventory automatically. Native
runs and `--list` print every omitted tooling file; the receipt binds the exact
included/omitted inventories for its commit. This is not full root-suite
coverage. In the verified snapshot, 40 files are included and 20 are omitted.

The omitted files cover package/CLI integration, capture brokers/stores,
workflow policy, schema/compiler tools and Linux guard infrastructure. Some
could eventually be ported; their omission does not imply that all require
Linux. `scripts/testing.test.ts` deliberately tests Python, Bubblewrap,
libseccomp, namespaces, `/dev/shm` and raw-socket denial. The independent
`tests/cloudflare` harness retains its own command and boundary.

An explicit file or directory selection containing any out-of-scope test fails
with the offending paths; it is never silently narrowed. For example,
`test:native scripts/testing.test.ts` and a broad `test:native .` fail. Use no
paths for the complete native scope, `src` for the source-only scope, or listed
portable-control files. Path filters apply within that scope. Empty discovery,
missing paths, unknown flags, empty files, all-skipped selections and unmatched
name filters fail. Four isolated file workers are the default; `--serial` keeps
isolated files serial. There are no arbitrary Bun/preload flags.

## Replay and fixture guarantees

The native child starts with `--no-env-file`, `--no-orphans` and the repository's
native preload. The launcher removes inherited `FMC_*`, `FETCH_DEVEL*`,
`NODE_OPTIONS` and `BUN_OPTIONS` controls, including case variants on Windows.
It sets `FMC_CACHE_MODE=replay`, clears `FETCH_DEVEL`, places the actual Bun
executable first on PATH, and points TMPDIR/TMP/TEMP at per-run scratch. The
preload repeats capture-control clearing before imports, blocks ordinary global
fetch, and prevents capture-session installation in that child. These changes
are native-only; strict recache sessions keep their dedicated preload/store.

Normal non-capture `tests/fetchCache.ts` now uses `tests/replayStore.ts` in both
replay modes. Its FMC-compatible `cache_dir` performs no mkdir, `storeContent`
always rejects, and IDs must be plain portable filenames without traversal,
Windows drive/stream syntax, forbidden characters or reserved DOS basenames.
Existing fixture roots are canonicalized for macOS temp ancestors, while linked
fixture roots/files are refused. Missing fixture directories remain missing.
No upstream FMC edit or new dependency is needed: FMC 3.1.0's Bun adapter uses
the portable Node adapter and replay already rejects cache misses.

A bounded upstream follow-up remains useful: FMC's FSStore joins cwd and an
absolute location, which changes the intended root (`path.posix.join('/repo',
'/fixtures')` gives `/repo/fixtures`, and the Windows join similarly appends the
drive-qualified path). It also calls mkdir on reads. ReplayStore explicitly
resolves its location and omits mkdir; it does not depend on an unreleased FMC
fix. The repository's default FMC location is relative, so the upstream join
behavior was not the source of the Linux-only development restriction.

Per-call `record`, `off`, read-cache or write-cache overrides cannot enable the
repository cache's rejecting network fallback or writable store. Controlled
ordinary fetch stubs cannot replace that closed-over fallback. Direct store
write attempts also reject. This cache guarantee does not stop arbitrary code
from explicitly calling filesystem APIs.

Before and after every native run, including failed/aborted runs, the launcher
hashes fixture paths, directories and file bytes under `tests/fixtures` and
`tests/http`. A difference fails visibly and requires inspection/restoration;
it is detection, not write denial. No rollback overwrites a user's files.
Fixture symlinks and non-regular entries fail before execution. External hard
termination, power loss or a surviving process after failed cleanup can prevent
or outlive the final comparison. The receipt independently verifies every
committed HTTP fixture against its base commit.

## Paths, watch, coverage and termination

Arguments use direct process spawning, platform path delimiters and file URLs;
there is no shell command interpolation. Inventory paths use `/`. Relative
repository paths avoid platform-specific absolute aliases; symlink selections
remain unsupported. Windows drive-case comparisons use `path.relative`, and
reserved-name/forbidden-character checks run before store access. The existing
1,201 fixture filenames pass the recorded Windows compatibility audit; actual
filesystem/runtime behavior still needs the OS matrix.

Watch fingerprints source/helper/test/configuration contents every 200 ms,
including the new helpers and package aliases, then cancels and rediscovers a
fresh native child. Controls verify additions/removals and package/helper edits.
It shares no test module/global state between runs. Restart the launcher after
editing its supervisor implementation or changing the alias command itself;
a rerun does not hot-reload the supervisor. Removing the last selection fails.

Coverage retains the staged lcov publication and stale-output clearing used by
strict replay, including no-match failure. This does not give native test code
filesystem restrictions. Per-test and whole-run timeouts retain failure status;
a normally cleaned whole-run timeout returns 124. Handled SIGINT/SIGTERM in the
public launcher map to 130/143. Windows forced termination does not provide
POSIX signal delivery or guarantee JavaScript finally hooks execute.

On POSIX native runs, Bun has a dedicated process group and the supervisor
signals/cleans that group. On Windows, Bun starts without POSIX detachment;
cancellation uses the absolute SystemRoot `System32/taskkill.exe` with
`/PID`, `/T`, `/F`, no shell and no negative PID. Its call timeout is five
seconds. A separate 1,500 ms close deadline prevents waiting indefinitely for
held stdio. Exited-parent, taskkill-failure and close/failure-race controls prove
visible bounded failure; such a failure returns an operational error and
explicitly leaves descendant cleanup unverified. Normal Windows exit relies on
Bun's `--no-orphans`; no Windows process-tree guarantee is inferred from POSIX
proof. Actual Ctrl-C, taskkill, inherited stdio and process-tree behavior require
real Windows verification.

## Evidence and remaining platform work

[The native receipt](results/native-replay.json) records the exact committed
base plus owned changes, native inventory, strict regression/full-suite results,
fixture hashes, frozen-install agreement and accepted cleanup review finding.
Linux executes the real native path and POSIX cancellation controls. Portable
unit controls exercise Windows command construction, environment handling and
bounded cleanup failure paths without invoking Windows. Actual native macOS and
Windows runs, including coverage/watch/signals, remain an OS-matrix milestone.
No Deno binary, live Yahoo request, fixture capture, CI weakening, runtime source
change or full-suite equivalence is claimed by this step.

## Portable filename review correction (v2)

The initial Sol review found that the store accepted Windows COM/LPT device
aliases containing superscript ¹, ² or ³. Version 2 rejects the complete DOS
set, including CONIN$/CONOUT$, case variants and extensions. It conservatively
strips trailing ASCII spaces from the first filename stem before checking the
set, so aliases such as `COM¹ .json` also fail. See Microsoft's
[file naming rules](https://learn.microsoft.com/en-gb/windows/win32/fileio/naming-a-file)
and Python's documented
[reserved Windows names](https://docs.python.org/3.13/library/os.path.html#os.path.isreserved).
This is a portable rejection policy; it does not claim Windows filesystem
execution. Similar ordinary names such as `COM10`, `COM⁴` and `CONIN$extra`
remain valid.

The v2 receipt binds a new exact-base candidate and focused guarded native/store
and strict-retention controls. Both `idFromRequest` and direct `cache_dir` reject
reserved names before any fixture-root access; a throwing root accessor and a
valid-name negative control verify that ordering. The complete 1,201-fixture
filename audit is repeated with this rule and fixture bytes remain unchanged.
The original immutable candidate and its 1,356-test native / 1,512-test strict
full-suite evidence remain historical evidence for their original hashes;
those broad suites were not rerun for this bounded filename correction.

Independent Sol xhigh and Astra xhigh reviews cleared the implementation and
v2 correction. Their initial reviews exercised native/strict controls, paths,
cleanup and typechecking. Narrow re-reviews confirmed reserved-name rejection
before filesystem access, valid neighboring IDs and all 1,201 fixture names.
Astra additionally checked 1,620 rejection assertions and 21 valid neighbors.
The implementation is accepted on Linux verification; actual native OS runs and
final combined CI acceptance remain open.
