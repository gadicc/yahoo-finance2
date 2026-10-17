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

## Coverage follow-up before merge

[Plan 014](../plans/014-bun-coverage-reconciliation.md) is complete: **7/7 sections**.
The original 72.95% project /53.77843% reported patch failures are resolved with
meaningful offline controls and genuine additional native controller coverage.
Global project/patch auto targets and zero tolerance remain. Deno and Bun have
different source inventories and engines; the old percentage delta alone did not
prove a corresponding loss of tests or an equivalent improvement.

| Coverage follow-up | Status | Done/total |
| --- | --- | --- |
| Baseline/head scope and instrumentation | Reconciled; limitations explicit | 1/1 |
| Meaningful direct offline controls | Full guarded suite passed | 1/1 |
| Independent runtime source completeness | Mandatory; negative controls passed | 1/1 |
| Actual native controller coverage/provenance | Fresh three-OS proof; sealed Linux reports | 1/1 |
| Global/scoped coverage policy | Validated; independent CLI/diff floors | 1/1 |
| Composed local and hosted processing | Seven jobs and eight Codecov checks passed | 1/1 |
| Independent Sol/Astra reviews and closure | Cleared; confirmed findings fixed | 1/1 |

### Coverage acceptance and provenance

Executed branch source: **`009cdab4853579dc11f6c8a15c67dff8fc28c727`**.
[Hosted run 39034285021](https://github.com/gadicc/yahoo-finance2/actions/runs/39034285021)
executed GitHub's synthetic merge **`420786a9adcb5506eeaa4a21b444c67d6db581cd`**
against base **`756f3f4f6a5138fea448307c6413952a21190515`**; its extra base commit
is the existing documentation typo correction. Tests, Workers, all three native
OS jobs, Complete coverage and Codecov upload passed. All **eight processed
Codecov project/patch checks** passed separately from upload acceptance.
This documentation-only closure updates this report, plan014 and the plan index; it does not
claim that these documentation bytes executed in that source run.

- Full local and hosted guarded suite: **1,589 leaves** (1,514 strict +75 trusted
  IPC), zero failures/skips across 68 files. All **99 Python controls** and ordinary
  format/lint/type/negative-type/schema/docs/release-note gates passed.
- Each native OS: **1,364 leaves in each parallel/serial/coverage mode**, fresh
  normal frozen installation, real installed Node22/24/Bun consumers and actual
  process controls. Workers: **8/8**.
- Hosted strict report: **105 sources, 13,577 mapped lines, 11,039 hits**.
  Local strict: same inventory, 11,032 hits; seven tooling hit lines vary between
  executions. The fresh same-run native union: **105 sources, 13,600 mapped lines,
  11,389 hits (83.74%)**. Independently recombining the downloaded strict/native
  artifacts reproduced the hosted combined bytes exactly.
- Complete local Git diff on the hosted synthetic merge: **7,062/8,701 mapped
  changed lines (81.16308%)**, passing the inherited **78.55%** floor. The exact
  event base/head, per-file misses and qualifications are retained in
  `diff-summary.json` alongside the combined artifact. A separate diff diagnostic
  is retained even on a floor failure. Manual/no-base runs explicitly report a
  previous-commit fallback and do not establish full-PR scope.
- All **1,201 fixtures** retain bytes and 0644 modes; root Bun and independent
  Workers locks are unchanged. No live Yahoo recache, dependency changes,
  publication or merging was used for this follow-up.

| Measured area | Sources | Hit/mapped lines | Bun line coverage |
| --- | ---: | ---: | ---: |
| Library (`src/`) | 52 | 3,496/3,982 | 87.80% |
| CLI (`bin/`) | 3 | 396/427 | 92.74% |
| Tooling (scripts + release config) | 39 | 6,866/8,493 | 80.84% |
| Test helpers | 11 | 631/698 | 90.40% |

Codecov reports project **83.74%**, library **87.79%** and tooling **80.84%**.
Its CLI project check succeeds with the explicit missing-base bootstrap; the
independent mandatory head check measures **396/427 (92.74%)**, exceeding the
inherited 78.55% floor before strict artifact retention and again after union.
Codecov `if_not_found: success` permits absent head as well as base, so it is not
the enforcement boundary. Restore its missing-report failure once `dev` has a
measured CLI baseline. CLI patch and all global requirements stay intact.

Codecov reports patch **92.38%**, CLI patch **91.60%**, tooling patch **92.45%**
and library "coverage not affected". **These use an incomplete diff**: GitHub's
large comparison omitted patch data for changed files including `scripts/test.ts`
and `scripts/schema-repair.ts`. The independent complete Git diff result above
is the patch acceptance evidence. It forces literal text paths and counts actual
additions, so binary attributes, wildcard siblings and inherited context settings
cannot silently omit changes or inflate the ratio. Renames count as whole
additions; deleted/unmapped/type-only/external-qualified lines are not measured.
No statement/branch or aggregate function coverage equivalence is claimed.

Direct tests cover actual launcher children and cleanup, MCP startup/redaction/
security, real TypeDoc conversion/render, synthetic country capture/rollback and
argument/preflight denial. Existing subprocess controls remain. Native install,
replay and package phases each execute once under explicit coverage wrappers;
Linux reports bind current source bytes, frozen metadata, run/attempt, phase role
and flushed byte hashes. Strict completeness remains independently mandatory.
Python, isolated publisher and remaining standalone entrypoint instrumentation
qualifications are explicit in `scripts/coverage-policy.json`; no hits are invented.

Independent **GPT-6.1 Sol xhigh** and important final/adversarial **Astra xhigh**
reviews cleared the composed source. Confirmed findings were fixed and tested:
source/directory aliases, alternate source extensions, root release inventory,
raw/merged report roles, sealed-byte provenance, literal/binary Git paths and
context inflation. Original instrumentation comparisons, remaining limitations
and detailed task closure are retained in [plan014](../plans/014-bun-coverage-reconciliation.md)
and [CI guidance](ci.md).

## Earlier follow-up summary

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
| Overall earlier follow-up | Complete | 13/13 | See exact-source provenance |

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
