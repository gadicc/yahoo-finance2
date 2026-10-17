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

Ten of thirteen follow-up items are complete. Payload cleanup, helper/probe
moves and consolidated documentation have independent review clearance. Final
composed-source verification, hosted CI, final reviews and integration remain
pending. This is not a final readiness declaration.

| Area | Status | Done/total | Recorded source |
| --- | --- | --- | --- |
| A. Recache and nested compiler | Complete | 2/2 | e96a3d9, 6a5baa0 |
| B. Repair docs gate and authoritative metadata | Complete | 2/2 | 5d61fff, 41491fd |
| C. Strict IPC, test tiers and coverage | Locally verified and reviewed | 3/3 | 915e558, 22b6b81 |
| D. Archive, helper paths and concise docs | Complete; Sol/Astra reviewed | 3/3 | ef99188, 96d4132 and link correction |
| Final CI, reviews and integration | Pending final source | 0/3 | Fresh composed-source gates required |
| Overall current follow-up | In progress | 10/13 | Final readiness pending |

Only individual items below count; finalize the table from those items. A passed
local focused check or old hosted run does not replace composed-head CI.

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
  On exact 22b6b81, 1,572 guarded tests passed (1,504 strict plus 68 IPC); final
  validation accepted 104 sources, 13,422 mapped lines and 9,786 hit lines.
  Those local counts describe that source, not the later composed cleanup head.

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
  publisher authorities remain. Final composed-source review is separate.

## Final validation and integration

- [ ] F1 — Record normal frozen installation, complete local/hosted CI and all six
  job results on the exact final source, with fixture bytes/modes unchanged.
  Repeat isolated nonpublishing publisher compatibility checks, including the
  minimum Deno consumer, on the composed source before claiming fresh evidence.
- [ ] F2 — Record the required independent and adversarial final reviews; resolve
  confirmed findings and rerun affected checks on the reviewed source.
- [ ] F3 — Record final integration/source provenance and clean destination status
  only after authorized integration. Publication remains separately authorized.

Current verification must preserve root/Workers lock ownership and exact pins,
all public entrypoints, source/runtime policies and real fixtures. No live Yahoo
capture, registry publication, credential exchange or provenance acceptance is
inferred from synthetic controls. Windows ACL/console/native HTTP, trusted native
replay, documentation/dependency warnings and other qualified limits remain
explicit in the operational guides and archived observations.
