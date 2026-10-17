# 014 — Reconcile Bun coverage before merging

Status: IN PROGRESS. Parent: [013](013-bun-migration-review-followup.md).
Branch: `codex/bun-migration`; [PR #1037](https://github.com/gadicc/yahoo-finance2/pull/1037), refs #1029.

The user requested the coverage follow-up recorded in the existing PR body.
Retain global project/patch auto targets and zero tolerance. Add scoped checks;
never choose a lower target merely to match current results. No live Yahoo
verification, fixture churn, Deno development execution, dependency changes,
publication or merging is authorized by this follow-up.

| Area | Status | Done/total |
| --- | --- | --- |
| Baseline/head scope and instrumentation | Collected | 1/1 |
| Meaningful direct offline controls | Focused and full pass | 1/1 |
| Independent source completeness | Implemented; counterfactuals | 1/1 |
| Native controller coverage/provenance | All three hosted OS jobs passed | 1/1 |
| Global and scoped Codecov policies | Official YAML validator passes | 1/1 |
| Composed validation and hosted processing | Pending | 0/1 |
| Independent Sol/Astra reviews and closure | In progress | 0/1 |

## Checklist

- [x] Retrieve actual Codecov baseline/head line reports and patch comparison.
- [x] Add direct MCP startup/redaction, real TypeDoc conversion/render and synthetic
  country capture/rollback controls while retaining subprocess controls.
- [x] Require all maintained production/tooling sources or explicit reviewed
  qualifications, with hash-bound type-only exceptions; reject source aliases.
- [x] Collect existing actual native install/replay/package controller execution with Bun
  coverage, retain distinct raw phase outputs and bind their provenance.
- [x] Keep global checks and add library/CLI/tooling statuses; validate YAML with
  Codecov. The initial CLI floor inherits the old global 78.55% requirement.
- [ ] Validate all local gates and exact-source hosted jobs, inspect processed
  project **and** patch checks, and address remaining actual gaps.
- [ ] Independent GPT-6.1 Sol xhigh and final/adversarial Astra xhigh reviews;
  commit/push isolated work and update report/PR with measured acceptance.

## Original evidence

Base `93bb36d`: 63 files, 5,321 mapped lines, 4,180 hits, 184 partials, 799 branches;
78.55% overall. Head `3539265`: 104 files, 13,472 mapped lines, 9,829 hits, no
branches emitted; 72.95% overall. Original patch: 2,199/4,089 (53.77843%).
The engines and line inventories differ. This is not a 5.60-point loss of tests.

| Area | Deno base hit/mapped | Bun head hit/mapped |
| --- | ---: | ---: |
| Library | 3,068/3,747 (81.88%) | 3,496/3,972 (88.02%) |
| CLI | Not measured | 208/423 (49.17%) |
| Tooling scripts | 683/1,049 (65.10%) | 5,456/8,341 (65.41%) |
| Test helpers | 384/480 (80.00%) | 631/698 (90.40%) |
| Release config | 45/45 | 38/38 |

Shared-path tooling alone is 683/1,049 before and 947/1,668 after (56.77%);
the broader tooling aggregate cannot prove unchanged quality. Missing child line
hits do not prove missing integration tests. Native, publisher and Python
qualifications stay explicit, with no fabricated zero-hit or hit records.

Read-only public endpoints used: Codecov `/api/v2/github/gadicc/repos/yahoo-finance2/report/?sha=SHA`
and `/compare/?base=SHA&head=SHA`. Original hosted LCOV is the `bun-lcov` artifact
from [run 39031222532](https://github.com/gadicc/yahoo-finance2/actions/runs/39031222532).
[Codecov report](https://github.com/gadicc/yahoo-finance2/pull/1037#issuecomment-6233722600).

## Progress and limitations

The first composed guarded run passed 1,583 leaves (1,509 strict +74 IPC), zero
failures/skips across 67 files. Its strict-only LCOV is 104 sources, 13,465 mapped
lines and 10,563 hits. This is preliminary execution, not final acceptance of
subsequent native collection/provenance changes. Direct tests passed 59 leaves.
One independent review identified source-directory aliases, alternate source
extensions, root release-config coverage and overclaimed launcher evidence;
all were corrected with counterfactuals/accurate qualifications.

The first parallel Python/full run hit the operator's /tmp quota while copying
repair controls. Repeating gates with private scratch on the workspace filesystem
passed; guard policy was unchanged. Record final counts after composed validation.


## Complete diff and CLI bootstrap

The first exact hosted run at cb8fb90 passed all seven workflow jobs, with
81.16% overall line coverage. Codecov's CLI project check could not find a base
report because Deno never instrumented `bin/`. CI now independently enforces the
inherited 78.55% CLI floor before strict artifact retention and after the native
union, with exact integer arithmetic and required-source completeness. The
service's temporary missing-report success applies to both base and head; CI is
the fail-closed boundary. Restore the service setting once dev has CLI baseline
data; do not manufacture one or relax the CLI floor.

The GitHub compare API also returned empty patch data for changed files late in
this large diff. Codecov's green patch check alone cannot prove full patch
acceptance. A new full-history local Git diff check reports exact base/head,
per-file mapped changed lines and misses; its independent floor remains 78.55%.
Direct launcher coverage executes real strict/IPC children, verifies the merged
artifact, and checks failed-child and invalid-argument stale-output cleanup.
Capture argument/preflight controls exercise failure/help without transport use.


Local closure passed 1,589 leaves (1,514 strict +75 IPC) across 68 files, zero
failures/skips. The strict-only report validates 105 sources, 13,577 mapped lines,
11,032 hits and CLI 396/427. Ordinary format/lint/type/negative-type/schema/docs
and release-note gates passed. The official Codecov YAML validator accepts the
configuration. Final exact-source hosted acceptance remains pending below.

Sol xhigh and Astra xhigh independently cleared this follow-up. Confirmed review
findings were fixed: literal Git paths prevent sibling hunk attribution, forced
text preserves binary-attributed sources, and counting actual added lines prevents
inherited context settings from inflating coverage. Regression controls exercise
these cases, real Git renames/spaced paths/deletions, floor boundaries, missing
CLI sources, failed launcher children and preflight transport denial. Failed diff
JSON is retained separately; failing coverage cannot publish the combined artifact.
