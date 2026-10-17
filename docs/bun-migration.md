# Bun migration follow-up

Development uses Bun 1.4.3 with the private root manifest and authoritative
`bun.lock`; Biome and root TypeScript own maintained tooling. The library retains
28 public exports, Node >=22.0.0, Bun >=1.4.3, Deno >=2.0.0 and JSR distribution.
Deno may run only inside the dedicated isolated publisher. See
[development](development.md), [testing](testing.md), [platforms](platforms.md) and
[release guidance](RELEASING.md) for current operating contracts.

The earlier **71/71** acceptance is historical and superseded for current
readiness by the review follow-up. Its counts, checklist IDs, original benchmark,
raw receipts, failed attempts and qualified platform observations remain in the
[immutable archive at 701f137](https://github.com/gadicc/yahoo-finance2/tree/701f137d05f861b7a046618ca08321dcbba2ce9e/tests/migration),
also preserved by the named
[`codex/bun-migration-archive` ref](https://github.com/gadicc/yahoo-finance2/tree/codex/bun-migration-archive).
The [archived REPORT](https://github.com/gadicc/yahoo-finance2/blob/701f137d05f861b7a046618ca08321dcbba2ce9e/tests/migration/REPORT.md)
retains all original A–L checklists and historical scope. Old experiment commands
require their corresponding historical checkout/graph, not current contributor
setup. Performance measurements must not be relabeled as new full-suite timings.

Of the 112 removed files, 107 retain identical bytes at 701f137. Five guides had
later follow-up updates: `CI-REPAIR.md`, `CI.md`, `RECACHE.md`, `TESTING.md` and
`TRUST-BOUNDARIES.md`. Their exact final pre-cleanup versions remain in
[ef991883](https://github.com/gadicc/yahoo-finance2/tree/ef991883a050a6e9aa78d9f61f67db11e0c235bf/tests/migration);
701f137 retains their originals. Current operating facts are consolidated here
and in the linked guides.

## Current follow-up summary

All thirteen follow-up items are complete. The recorded gates, independent
reviews and authorized source integration are summarized below. The historical
71-item acceptance and benchmarks retain their original scope; this follow-up is
a separate 13-item
checklist. New full-suite elapsed times are validation observations, not repeat
benchmarks.

| Area | Status | Done/total | Recorded source |
| --- | --- | --- | --- |
| A. Recache and nested compiler | Complete | 2/2 | e96a3d9, 6a5baa0 |
| B. Repair docs gate and authoritative metadata | Complete | 2/2 | 5d61fff, 41491fd |
| C. Strict IPC, test tiers, coverage and shutdown | Complete; Sol/Astra reviewed | 3/3 | 915e558, 22b6b81, ab0ba02, b70c2ae, 7b7bd16, acca304 |
| D. Archive, helper paths and concise docs | Complete; Sol/Astra reviewed | 3/3 | ef99188, 96d4132, 671eec8 |
| Final CI, reviews and integration | Complete | 3/3 | Executed 2e6d8a7; metadata successor below |
| Overall current follow-up | Complete | 13/13 | See exact-source provenance |

### Exact-source provenance

| Gate | Actual evidence |
| --- | --- |
| Executed composed source | `2e6d8a79886e59b6a0335aab092115ffa434c580` |
| Ordinary local verification | All 12 gates passed, including 84 Python controls and `CI=true` full guarded coverage: 1,575 passed, zero failed across 67 files (1,507 strict, 68 IPC) |
| Complete merged coverage | Local: 104 sources, 13,472 mapped lines, 9,830 hit lines. Hosted: the same sources and mapped lines, 9,829 hit lines. Aggregate function counts are unavailable (`null`) |
| Isolated nonpublishing publisher | All 31 expected outcomes passed, including controlled negatives; real tarball exports/bins/declarations, JSR dry-run, and Deno 2.6.7 plus exact 2.0.0 source/installed consumers |
| Fresh hosted matrix | [Run 39028645888](https://github.com/gadicc/yahoo-finance2/actions/runs/39028645888): all six jobs passed on exact 2e6d8a7: Tests, Workers, Codecov and native Linux/macOS/Windows |
| Native and Workers | Each native OS passed 1,364 leaves in each parallel/serial/coverage mode, fresh normal frozen installation and installed Node22/24/Bun consumers; Workers passed 8/8 |
| Codecov | The 135,384-byte upload was accepted and queued at 11:30:12 UTC on 2026-10-17. Dashboard processing was not verified |
| Independent final reviews | Sol xhigh substantive review and Astra xhigh adversarial review cleared the composed source and final raw evidence; confirmed findings are resolved |
| Integration and metadata successor | Reviewed source 2e6d8a7 was fast-forwarded and pushed to `codex/bun-migration`; destination and origin matched cleanly. This documentation-only successor is not itself executed |

The verification above executed 2e6d8a79886e59b6a0335aab092115ffa434c580.
This documentation-only successor updates this guide, plan013 and the plan index;
all other tracked bytes match the executed source. No execution on this successor
is claimed. The one-line local/hosted coverage-hit difference does not change the
source inventory.

All 1,201 real fixture files retain their bytes and 0644 modes; root `bun.lock`
and the independent Workers npm lock retain their bytes. Merged multi-batch LCOV
is line-only because Bun omits the identities needed to combine function metrics;
strict raw Bun validation and genuine single-batch native function metrics remain.

## A. Operational corrections

- [x] A1 — Bound recache capture/baseline budgets, forward the inner timeout and
  restrict default capture inventory; retain pacing/cancellation/429 behavior.
  Recorded in plan013 at e96a3d9.
- [x] A2 — Treat foreign compiler resolution probes as unavailable while auditing
  owned program closure; verify a nested checkout with competing ancestor graph.
  Recorded in plan013 at 6a5baa0.

## B. Repair and metadata

- [x] B1 — Include docs lint and exact documentation input closure before repair
  readiness/bundling; reject undocumented drift without broadening AST policy.
  Recorded in plan013 at 5d61fff.
- [x] B2 — Pin recache images to Ubuntu 24.04, derive ordinary verification tool
  pins from root metadata, and record actual installed TypeDoc version.
  Recorded in plan013 at 41491fd.

## C. Guard, tiers and coverage

- [x] C1 — Strict replay/repair deny Unix/IP/VSOCK/io_uring, retain only tested
  connected stream pairs, close extra descriptors and mask common socket paths
  with exact nested tool/input restores. Synthetic kernel/Workers/repair controls
  passed; independent Sol/Astra reviews cleared the implementation.
- [x] C2 — Default to maintained library replay, retain the complete `--full`
  inventory and focused tooling selections, partition the exact five IPC controls,
  and enforce one deadline plus aggregate fresh JUnit/leaf/cancellation checks.
- [x] C3 — Validate raw Bun function pairs, publish safely merged line-only LCOV
  without inventing aggregate function metrics, and retain the full source gate.
  The exact final executed source and complete-source counts are recorded above.

Bounded shutdown retains the first real cleanup error: ab0ba02 prevents duplicate
Windows tree termination, b70c2ae restores POSIX TERM-to-KILL escalation, and
7b7bd16 closes only owned pipes on an unverified-close watchdog. Fixture-only
acca304 directly owns a READY-confirmed bounded writer; removing only pipe
detachment in a disposable helper retains the original error but makes the
controller time out, proving the liveness regression control. It does not claim
writer termination. The initial hosted macOS EPERM cause remains unknown; later
passing runs do not establish which earlier operation produced it.

## D. Payload and operational documentation

- [x] D1 — Remove 78 dated receipts, nine experiment drivers, two unused compiler
  configs and 23 superseded guides. Originals remain at immutable 701f137,
  retained by local/origin `codex/bun-migration-archive`; the five evolved guides'
  final pre-cleanup bytes remain at ef991883 as detailed above. The historical
  REPORT URL remains a compatibility landing page.
- [x] D2 — Move five maintained adapters to `tests/helpers` and eleven probes to
  `tests/package`, with imports/configs updated at ef99188 and independent Sol
  review cleared. Preserve ignored incremental caches and negative sample paths.
- [x] D3 — Eight current guides, contributor/agent policies, inbound links and
  precise upgrade notes are implemented. Independent Sol/Astra reviews cleared
  the cleanup after one anchor correction; existing release/schema-repair/
  publisher authorities remain. Final composed-source review is complete.

## Final validation and integration

- [x] F1 — All 12 local gates, complete `CI=true` guarded coverage, all six fresh
  hosted jobs, normal frozen native installs and the complete isolated
  nonpublishing publisher rehearsal passed on exact 2e6d8a7 as recorded above.
- [x] F2 — Independent Sol xhigh substantive and Astra xhigh adversarial reviews
  cleared the composed changes and final evidence. Confirmed findings are
  resolved; affected checks and the failing counterfactual control are verified.
- [x] F3 — Reviewed source 2e6d8a7 was fast-forwarded and pushed, with a clean
  matching destination/origin. This documentation-only successor preserves every
  other tracked byte; all execution evidence remains attributed to 2e6d8a7.
  Publication remains separately authorized.

Current verification must preserve root/Workers lock ownership and exact pins,
all public entrypoints, source/runtime policies and real fixtures. No live Yahoo
capture, registry publication, credential exchange or provenance acceptance is
inferred from synthetic controls. Windows ACL/console/native HTTP, trusted native
replay, documentation/dependency warnings and other qualified limits remain
explicit in the operational guides and archived observations.
