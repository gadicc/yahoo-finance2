# Plan 013: Resolve adversarial Bun migration follow-up

## Status
- Priority: P1; effort: M/L across isolated steps; fix risk: LOW/MED.
- Planned at: 701f137d05f861b7a046618ca08321dcbba2ce9e, 2026-10-17.
- Depends on: completed migration source and the external-review triage.
- Scope: migration tooling, tests and contributor documentation. No library API/fixture changes.

## Progress
| Step | Status | Evidence |
| --- | --- | --- |
| A1 recache budgets/inventory | Complete | e96a3d9; Sol/Astra cleared; root 51 focused tests passed |
| A2 nested compiler resolution | Complete | 6a5baa0; Sol/Astra cleared; root 7 builder tests passed |
| B1 repair documentation gate | Complete | 5d61fff; Sol/Astra cleared; root 34 Python and 23 AST/CLI tests passed |
| B2 image/tool metadata | Complete | 41491fd; Medium execution, Sol cleared; 19 focused tests and required gates passed |
| C guard and D test tiers | Complete | 915e558 + 22b6b81; Sol/Astra cleared; 1,572 leaves pass, validated line-only LCOV covers 104 sources |
| D archive/docs cleanup | Complete | ef99188 relocates 16 unchanged helpers/probes; 96d4132 + 671eec8 archive/consolidate guides; Sol/Astra cleared with anchor/provenance corrections |
| Final integration/CI/review | Pending | No final readiness claim until validation on final source |

## Intent and boundaries
The current six-job CI passed, but did not establish usable production recache budgets,
nested-checkout builds or repair/docs integration. Prior 71/71 readiness is superseded
until these defects and new validation are resolved. Preserve Bun development 1.4.3,
Bun consumer >=1.4.3, Node >=22, Deno >=2 and JSR publication. Keep root bun.lock
authoritative and Workers npm lock independent. Exact JSR pins versus npm caret ranges
are intentional and already documented in docs/UPGRADING.md:29-34.
Do not invoke Deno except an explicitly isolated publisher rehearsal; do not perform
live Yahoo requests, capture/recache, real fixture writes/chmod, registry publication,
release authentication/OIDC, merge into dev, tag, global tool/settings changes, or external messages. Ordinary authorized Tests CI, including its existing Codecov upload, remains required.

## Working tree and commands
Use isolated /home/dragon/.codex/worktrees/bun-review-followup/yahoo-finance2.
The destination branch is codex/bun-migration, currently clean at the planned SHA.
Never reset or overwrite unrelated work. Get an exact official Bun 1.4.3 binary with
official checksum verification into ignored local/toolchains; Node24.21.0 exists at
/home/dragon/.nvm/versions/node/v24.21.0/bin/node. Do not change global tools.
Install normal frozen hooks, not ignored lifecycle scripts. Dependency/tool download
is separate from offline tests and allowed. Use bun run check:toolchain, bun install
--frozen-lockfile, bun run test:serial -- <file>, bun run typecheck,
bun run typecheck:negative, bun run format:check, bun run lint,
bun run schema:check, bun run docs:lint. Linux guard remains fail-closed.
No direct unguarded source tests as acceptance. Disposable synthetic fixture roots
and safe read-only/in-memory compiler probes are permitted.

## A. Fix operational defects (first; separate logical commits)
Files: scripts/recache/{baseline,orchestrator,child}.ts, relevant recache tests/docs;
scripts/build_npm.ts and build_npm.test.ts.
Current baseline.ts:7 constructs parseArguments(["--serial", ...files]) and
orchestrator.ts:78 never forwards its timeout. Default capture deadline is120000ms;
quoteSummary has840 distinct module/symbol validation requests, implying2517seconds
of spacing at3000ms. Keep real pacing/429/fixture-validation semantics intact.
Make the selected baseline timeout reach the inner runner. Provide realistic,
bounded default capture and baseline budgets with clearly documented CLI behavior.
A one-hour capture-file budget and shorter five-minute baseline are reasonable;
preserve the advertised --run-timeout override semantics or add explicit options
without ambiguous order dependence. Restrict recache's default baseline/capture
inventory to maintained library/fixture tests rather than tooling integration tests,
and reject explicit noncapture/tooling paths clearly. Country capture must continue
to work through the shared helper. No live verification is authorized.
Add short synthetic regression controls for timeout forwarding, large paced-workload
budget selection, default inventory and cancellation/429 preservation.

compilerHost at build_npm.ts:191-215 throws on every foreign TS readFile probe.
Nested .claude/worktrees/review-bun-migration fails when TS probes an ancestor SDK
package.json. Treat foreign resolution probes as unavailable; retain owned source
symlink/regular-file checks and audit actual program.getSourceFiles closure.
Verify a disposable nested checkout with its own dependencies plus a competing
ancestor dependency graph; ensure no ancestor source/package is incorporated.
Run focused recache/build controls, types and style with fixtures unchanged.

## B. Align repair, CI image and authoritative tool metadata
Files: scripts/ci_repair.py, ci_repair_test.py, schema repair prompt/docs and
focused tests; .github/workflows/recache-yahoo-fixtures.yaml;
scripts/native-platform.ts and tightly scoped tool-metadata helpers/tests if needed.
ci_repair.py:291-299 omits docs:lint although ordinary Tests includes it.
Add equivalent guarded documentation validation before ready/bundling; ensure the
trusted/candidate compatibility closure includes all docs-tool/config inputs.
Add regression showing an AST-allowed undocumented field cannot be declared ready
when docs rejects it, while plain factual JSDoc can pass. Do not guess field
semantics, automatically rewrite warning baselines or broaden AST permissions.
Update repair instructions to explain actual gate/policy.
Pin affected Linux jobs to ubuntu-24.04 matching ci_apparmor.py:227-231.
native-platform.ts:385 hardcodes Biome2.5.15;:553-554 install fixed TS/Node type
versions independently of package.json. Derive ordinary verification tool versions
from authoritative root metadata while preserving exact checks/installations.
Keep deliberate Bun, consumer-runtime and publisher-host compatibility policies.
Validate focused Python tests, actual guarded synthetic repair/docs flow, types/style.

## C. Harden privileged IPC without breaking capture
Files: scripts/testing/offline.py, scripts/ci_repair.py and their guard/recache/
Workers controls and trust-boundary docs.
Current mounts expose readonly host /run and /tmp, seccomp denies only AF_INET,
AF_INET6 and io_uring. AF_UNIX privileged services can act outside mounts.
Propose a compact explicit policy before implementation. Compare socket-family syscall
arguments using their kernel-consumed low 32 bits, not full-width equality. Deny
retargetable Unix datagram socketpairs too; preserve only demonstrated safe runtime
IPC if necessary, with direct negative controls. Ordinary strict replay and
repair verification should deny host Unix-socket access and AF_VSOCK, with synthetic
sentinel denial tests, without touching Docker or any real privileged service.
Capture intentionally uses a private Unix-socket broker; keep that separately
authorized path working with its own explicit policy. Mask common host socket
directories/private temp as appropriate, preserve required explicit root/scratch/
tool paths, and do not claim stronger guarantees than tested. Do not replace the
guard architecture wholesale or add general hostile-code promises.
Coordinate C with the D tier split: inherited seccomp cannot be relaxed by a child.
Run strict library replay separately from an exact allowlisted trusted IPC-control
batch, never relax the whole full suite due to one IPC test. Preserve complete
LCOV validation across batches using a small validated merge if needed. Repair
verification must remain strict and validate all library leaves affected by types.
Run guard/Workers/recache synthetic controls under normal guard, and broaden only
for newly affected paths. Test high syscall-argument bits, child inheritance,
connected inherited sentinel FD closure and temporary-path root/runtime restores.

### Reviewed guard, batching and coverage constraints
- The trusted IPC profile is an explicit launcher choice, never inherited environment.
  New/unknown test files default strict. Full inventory partitions into a strict batch
  and a small exact-path trusted IPC-control batch before either guard is spawned.
  Direct focused tooling paths must continue to work; native/full contradictions fail.
- Deny low-32-bit Unix/IP/VSOCK socket creation and io_uring in strict mode. Deny
  retargetable Unix datagram socketpairs. If Bun requires stream socketpairs, prove
  the precise allowed connected pair cannot retarget an own disposable sentinel.
- Mask /run, /tmp and /var/tmp before exact canonical root/scratch/runtime/helper
  restores. Test root and runtimes under hidden temp outside selected root. Never
  restore an entire temp/PATH parent merely to reach a binary. Capture remains a
  trusted Unix profile, not a pathname socket allowlist; visible other paths and
  intentional stdio 0/1/2 remain explicit trusted transports. Close extra connected
  socket FDs, including repair launchers. Workers retain their documented loopback
  profile and accurate host IPC limitations with tests adapted to masked temp.
- One whole-run deadline and cancellation signal span both batches. Aggregate JUnit
  executed leaves so a name filter matching only one batch can pass, but no executed
  leaves globally fails. Unfiltered CI retains every prior leaf without skips.
- Restore the exact owning checkout and explicit required tool package subtrees as
  well as runtime binaries across nested guards; capture preload imports and the
  independent Workers npm tree may lie under hidden temp outside the selected root.
  A filtered batch may have fresh successful JUnit but no LCOV when no instrumented
  source ran. Merge only available current-run records; never reuse stale metrics.
- Stage each fresh batch LCOV, then publish only after all child statuses, JUnit,
  aggregate leaves and final cancellation/deadline checks succeed. Failure, empty
  selection or cancellation clears stale and partial artifacts. Preserve the complete
  required-source gate in ci.validate_lcov. Merge canonical SF records, safely sum DA
  hits and recompute LF/LH; reject malformed/duplicate/unsafe/inconsistent/overflowed
  inputs. Actual guarded reports at 915e558 disproved stable function inventories:
  inventory.ts emitted FNF/FNH 7/4 versus 13/12 and native.ts 17/11 versus 8/0.
  The pinned Bun implementation merges ByteRange identities internally but its
  LCOV omits those identities. Publish merged **line-only** LCOV, omitting FNF/FNH
  rather than inventing zeroes, bounds or selected-profile aggregate percentages.
  Keep default raw-Bun validation strict, including genuine function pairs; an
  explicit merged-line validator must forbid function fields and retain the same
  complete owned-source and DA/LF/LH checks. Aggregate functions are unavailable,
  not zero. Single-batch native output retains its genuine function metrics.
- Test overlap/disjoint sources, second-batch-only line hits, duplicate function hits,
  mismatched runtime function inventories, explicit line-only output, malformed/stale/failed or
  canceled second batches, global timeout/filter behavior and complete partition.

## D. Make contributor tests fast and trim the merge payload
Files: package scripts, scripts/test.ts/testing inventory and tests, CI and active
contributor docs; tests/migration historical docs/results; AGENTS.md;
docs/UPGRADING.md, plans/README.md as needed.
Separate fast guarded library replay from tooling integration with an explicit
full-suite command used by CI. Preserve every existing test leaf and zero-skip/
offline enforcement; no weakening gate or hidden omission. Keep portable native
mode explicit and its scope clear. Update recache baseline to the intended tier.
Move archival experiment/evidence material out of the main merge payload only after
preserving it in a named local Git archive ref and/or durable archive with hashes.
Do not remove maintained adapters merely because their current folder is called
migration. Update imports/tsconfigs/tests and all active links if paths move.
Keep a concise current migration summary and operational docs; replace stale
71/71 with honest post-review status. Remove branch-specific model-routing text
from permanent AGENTS.md while retaining normal contributor policies and footer.
Add concise upgrade/release notes for MCP Host/routing, CLI errors, cookie hardlink
refusals and runtime-detection behavior. Mark historical plans' commands as
historical and provide current commands, without rewriting old evidence claims.
Present the proposed archive/move mapping before applying broad cleanup.

## Review and Git workflow
One substantive executor on GPT-6.1 Sol High; use Medium only for mechanical work.
Root advisor never edits source. Work in the isolated tree and commit meaningful
isolated steps with scoped Conventional Commits and motivation, ending:
Co-authored-by: Codex (gpt-6.1-sol, reasoning: high)
Do not push or integrate destination branch yourself unless root explicitly directs.
Get independent Sol xhigh review of each meaningful step and Astra xhigh for guard/
important integration/final readiness. Reviewers seek hidden defects, edge cases,
regressions, security issues and test gaps; fix confirmed findings before continuing.
Use concise evidence summaries, not a new large committed evidence corpus.
Do not update plans/README.md status: root advisor maintains it.

## Done criteria
- Each scoped regression and all required types/style/schema/docs gates pass.
- Clean frozen normal install and complete hosted six-job matrix pass on final source.
- Real1201fixtures retain content and0644 modes; no unauthorized live/pub actions.
- Nested build passes without reading competing ancestor deps.
- Repair docs failure is caught before ready/bundle; supported documented repair passes.
- Strict replay/repair deny synthetic host Unix IPC and IP/VSOCK operations while
  explicitly authorized capture broker and Workers controls pass.
- Fast and full tiers have explicit complete inventories; full CI retains all leaves.
- Archive is recoverable, active docs/links/commands correct, no stale blanket readiness.
- Independent review findings resolved; destination integration contains only cleared
  changes and is clean and pushed, with exact validation provenance.

## STOP conditions
Report scope mismatch, unexplained source/fixture/lock drift, unexpected destructive
archive operation, actual credential exposure or needing live requests, release authentication or publication.
A failing verification requires investigation, not disabled assertions, weaker
fixtures/AST policy, unguarded retries or blanket timeout inflation. Two unsuccessful
repair attempts for a specific step require reporting evidence before redesign.
Continue independent work while decisions/reviews are pending.

## Proposed cleanup mapping (review before application)
Preserve commit701f137 under codex/bun-migration-archive before deletions. Move the
five maintained runner/assertion/mock/time/type adapters to tests/helpers and the
eleven maintained package/CLI/Workers probes together to tests/package. Archive
old benchmark/prepare/run/watch/offline/negative-typecheck/guard/std aliases/PTY
experiment scripts, all results, and unused migration/native historical tsconfigs.
Keep .migration-results incremental caches and negative security test sample paths.
Consolidate current migration guidance into docs/development.md, testing.md,
fixture-capture.md, ci.md, platforms.md, packaging.md, runtime-security.md and
bun-migration.md. Existing release/schema-repair/publisher guides remain. Update
all active imports/configs/links and replace dated readiness with current status.
Do not archive or alter unrelated preexisting project plans.

## Coverage integration correction (2026-10-17)
The full frozen 915e558 run passed strict 1,504/62 files and IPC 68/5 files,
but correctly published no report when the original consistency rule failed.
Root independently passed six real guard controls and three merger controls; Sol
cleared the code and four guarded launcher controls, and Astra found no other
boundary/cancellation defect. Coverage readiness remains open until the corrected
representation and full-source artifact gate pass. This is not an executed final
readiness claim. The primary LCOV tracefile grammar permits optional cover types:
https://github.com/linux-test-project/lcov/blob/master/docs/man/geninfo.rst
Pinned Bun source: src/jsc/bindings/CodeCoverage.cpp and
src/sourcemap_jsc/CodeCoverage.rs at bun-v1.4.3.

### Corrected C result
On exact 22b6b819d20385e9fba7457e6131cc361bdcadba, strict 1,504/62 files and
IPC 68/5 files passed (1,572 total, zero failures). Final coverage accepted
104 sources, 13,422 mapped lines and 9,786 hit, with null aggregate function
metrics and no FN fields. Root independently passed all 14 ci.py controls.
Sol cleared both C ranges and repeated guarded transactional/native checks; Astra
independently compared every DA sum against raw reports, proved input-order
independence and rejected mode mismatch/missing required source. Fixtures remain
1,201 files with unchanged bytes and 0644 modes. This clears local C; final
composed-source installation, publisher, hosted CI and review remain pending.


### D archive and documentation result
The local and origin archive ref retain 701f137. The durable proof archive has
SHA256 02deae30863816539572a121bb18ec24f17a5c801c3d15d0ad1b80ae68024944.
Commit ef99188 moves five test adapters to tests/helpers and eleven installed
package probes to tests/package without byte/mode changes. Sol independently
reviewed the relocation and ran 23 harness/framing controls. All 68 maintained
root/Workers test-file paths remain selected as before.

Commit 96d4132 removes exactly 112 reviewed historical paths and consolidates
current contributor guidance. All removed paths exist at 701f137; 107 blobs are
identical there. Five operational guides evolved during A/B/C, and their exact
last bytes remain at ef991883. Root verified those Git objects and archive refs.
Sol checked 158 local links/anchors; Astra independently reviewed retained scope,
security and publication qualifications. Both found the same removed-heading
link in docs/validation.md; 671eec8 repairs it and clarifies exact archive versions. Focused tooling,
types, schema, style and documentation gates passed; final composed validation
and fresh isolated publisher rehearsal are still required.


### Final composed validation and discovered cancellation regression
On exact e104567, all 12 local gates passed: 84 Python controls, real strict
preflight, types/negative/style/schema/docs/release checks, 1,572 guarded leaves
and complete line-only LCOV. The fresh isolated nonpublishing publisher rehearsal
also passed all 31 command records, including actual source and installed package
consumers on Deno 2.0.0 and 2.6.7, all 28 ESM/CJS exports and three bins on Node/Bun,
and the intentional compatibility negatives. These are observations on e104567,
not execution on a later correction.

Hosted run 39026913830 exposed a composed cancellation regression. The new whole-run
abort timer and the helper's remaining-budget timer can both call termination.
Sol independently reproduced two Windows cleanup calls, where the second reports
an already-exited process and replaces a legitimate timeout with driver exit 2.
Astra independently confirmed the path. Windows native-full failed 1,360/1;
macOS parallel passed but serial failed two timeout controls, one surfacing EPERM
without a throwing-site stack. Linux native and Workers passed. These failures
remain evidence and are not counted as final acceptance. The authorized narrow
correction latches termination once, preserves the first cleanup error and bounded
close behavior, adds a deterministic collision control and richer synthetic driver
diagnostics. macOS EPERM remains fatal; exact-host rerun must verify the correction
and retained descendant-cleanup assertion before final clearance.


The narrow correction is committed at ab0ba02. Its 11 guarded native controls,
including both fake-Windows collision outcomes, pass; types/style pass. Sol
independently reran the collision control and cleared the code. The first-error
identity, bounded unverified-close failure and final POSIX SIGKILL remain intact.
The exact-host macOS/Windows results and composed corrected-source gates remain
pending; the initial failures are not attributed beyond the available evidence.


### Corrected-source evidence and bounded shutdown follow-up
Exact 9527476 passed all 12 local commands, 84 Python controls and 1,573 guarded
leaves (1,505 strict plus 68 IPC). LCOV accepted 104 sources, 13,427 mapped lines
and 9,792 hit lines. Its fresh minimum-Deno publisher rehearsal passed all 31
command records. All six hosted jobs in run 39027291740 passed. Each native OS
passed normal-hook frozen installation, 1,362 leaves in parallel, serial and
coverage modes, and actual installed package checks. The Codecov uploader accepted
135,224 bytes and queued processing; this is not a claim about later dashboard
processing. This establishes observed corrected-source behavior, without claiming
to identify the throwing site of the initial macOS EPERM.

Review also independently reproduced two bounded-shutdown defects before final
acceptance. Baseline strict replay forced SIGKILL after one second; the shared
helper initially waited until its 1.5-second failure watchdog before attempting
force in finally. Sol's owned TERM-ignoring child failed at 1,522ms and closed only
after finally-KILL at 1,524ms. Commit b70c2ae restores force before the unchanged
watchdog, preserves actual first cleanup errors and exposes strict child output
in timeout assertions. Sol/Astra cleared the implementation and deterministic
TERM-close, KILL-close, KILL-error and never-close scenarios.

The new piped stderr path also made child.unref alone insufficient to bound the
controller's exit. Sol independently demonstrated an owned Bun controller that
rejected at 70.8ms but remained alive for 2.048 seconds while its bounded writer
held stderr. The narrow authorized correction closes only child-owned pipes on
watchdog failure, preserving the original error and explicit unverified descendant
cleanup. Ordinary output and process stdio remain untouched. Fresh composed-source
gates, hosted jobs and final review remain required after this correction.


Commit 7b7bd16 bounds held-pipe watchdog failure, with each getter/destroy operation
inside a per-stream guard. Its portable real controller exits in about 138ms while
the owned writer is bounded to four seconds; the original cleanup error remains
visible. A defensive throwing-getter control proves remaining pipes still close
without replacing that error. The fake ChildProcess stdio properties explicitly
model inherited null handles, because Bun's unspawned lazy getters need a spawn
handle. Across b70c2ae and 7b7bd16, 29 focused guarded controls pass, with clean types
and unchanged style diagnostics. Independent Sol/Astra source review has cleared
the shutdown changes; the new final freeze still requires full composed validation.
