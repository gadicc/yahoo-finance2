# K02 semantic lint and directive migration

This semantic phase was reviewed in an isolated mirror of exact committed base
`0e10be3`, excluding the concurrent native replay and CI changes. The exact
reviewed patch is now applied to the migration branch. Formatting and import ordering are unchanged;
no Biome write/unsafe-fix command was used. The pinned recommended preset and
all its severities remain intact.

## Intended changes

The candidate fixes sixteen owned error diagnostics. Cookie-file preparation
still closes every opened descriptor, preserves sanitized preparation errors,
and gives a sanitized close error precedence when both operations fail. It
records the pending error during cleanup and throws afterward. A regression
checks both close-only and combined preparation/close failure cases.

Six evolving implicit `let` declarations receive explicit local types or a
typed initializer. Assignment expressions become separate statements, retaining
the spy's generic return value in a local. The fundamentals comparisons use
strict equality on operands that already have string types. No public interface
or overload changes are introduced.

All 66 obsolete Deno lint directives are removed. Existing `any` boundaries keep
their types and get line-specific `lint/suspicious/noExplicitAny` comments that
explain their existing contract; the old file-wide spy directive becomes two
local comments. The two redundant queue callback annotations are removed in
favor of inference. The ANSI-stripping regex and deliberate PromiseLike test
receive one precise rule-specific suppression each. No file, range, category or
all-rule suppression is introduced, and Biome reports no unused suppressions.
There were no Deno format directives in maintained source.

Existing `@ts-ignore` directives are not mechanically changed to
`@ts-expect-error`. The schema tool and project checker use different TypeScript
versions, and some comments protect generator-specific code. Their nineteen
Biome warnings remain visible. This step also leaves other warnings and
information diagnostics visible instead of introducing unrelated API, generic,
validator or template refactors. In particular, release-command `${...}` text
remains literal template syntax for the separate release migration.

## Review correction

Sol reported one accepted P3 accuracy issue: the new default/runtime query
suppression explanations incorrectly claimed those values were schema-checked.
Only user overrides are validated before the values are merged. The two comments
now explain preserving module-specific default/runtime shapes in the shared
execution contract. The overrides explanation remains unchanged. No executable
code, types or validation behavior changes in this correction.

Focused lint confirms the comments still suppress only their intended explicit
`any` diagnostics. A fresh guarded build is byte-identical to the prior candidate
for every emitted JavaScript executable/module and declaration. Existing strict
checking, 193 affected tests, schema parity and independent behavior controls
remain evidence for the unchanged implementation; they are not broadly rerun for
two comments. The original patch, archive, manifest and mirror are retained.

## Application list

Apply only the files in the accompanying manifest and patch after isolated
review. Each source path is checked against its exact committed-base hash.
`biome.json`, manifests, lockfiles, generated output, fixtures and REPORT are not
part of the patch.

| File | Proposed edit |
| --- | --- |
| `bin/runtime.ts` | Preserve sanitized error precedence while moving the throw after cleanup. |
| `scripts/build_npm.ts` | Annotate the filesystem-status local. |
| `scripts/check-recache-rate-limits.ts` | Document the intentional ANSI regex with its exact Biome rule. |
| `scripts/schema-repair.ts` | Annotate the optional previous filesystem status. |
| `src/createYahooFinance.ts` | Replace three legacy `any` directives with local contract explanations. |
| `src/lib/cookieJar.ts` | Type the optional parsed-cookie array. |
| `src/lib/errors.ts` | Document the existing raw-validation-result and dynamic error-constructor contracts. |
| `src/lib/moduleCommon.ts` | Document module-instance extensions and the schema-generator executor boundary. |
| `src/lib/moduleExec.test.ts` | Document intentional invalid inputs in existing negative tests. |
| `src/lib/moduleExec.ts` | Document module-specific default/runtime shapes, validated overrides and transform boundaries. |
| `src/lib/options/logger.ts` | Document existing console-compatible logger argument lists. |
| `src/lib/queue.ts` | Document stored callback contracts; remove two redundant callback annotations. |
| `src/lib/validateAndCoerceTypes.test.ts` | Initialize the error local from its typed value and migrate logging comments. |
| `src/lib/versions.test.ts` | Split two global-fetch assignment expressions. |
| `src/lib/versions.ts` | Assign the cached version result before returning it. |
| `src/lib/yahooFinanceFetch.ts` | Document existing fetch-context extensions and dynamic queue options. |
| `src/modules/chart.ts` | Document raw-envelope normalization before validation. |
| `src/modules/fundamentalsTimeSeries.ts` | Replace three string comparisons and explain existing raw/normalized result boundaries. |
| `src/modules/historical.ts` | Annotate schema-key/result locals and document existing overload contracts. |
| `src/modules/options.ts` | Document raw-envelope normalization before validation. |
| `src/modules/quote.ts` | Document existing open quote fields, overloads, raw normalization and object returns. |
| `src/modules/quoteSummary.ts` | Document raw-envelope normalization before validation. |
| `src/modules/recommendationsBySymbol.ts` | Document raw-envelope normalization before validation. |
| `src/modules/screener.ts` | Document raw-envelope normalization before validation. |
| `src/modules/trendingSymbols.ts` | Document raw-envelope normalization before validation. |
| `src/other/quoteCombine.ts` | Document the existing heterogeneous cache value contract. |
| `tests/cli-entrypoints.test.ts` | Add close-only and combined-failure diagnostic-precedence coverage. |
| `tests/common.ts` | Document the existing spy logger argument contract. |
| `tests/harness.test.ts` | Explain the deliberately defined thenable method. |
| `tests/migration/mock.ts` | Replace the file-wide directive and split assignment while preserving `ReturnType<T>`. |
| `tests/migration/runner.ts` | Document heterogeneous table-driven callback arguments. |
| `tests/migration/K02-SEMANTIC.md` | Record this preparation policy, application list and limitations. |
| `tests/migration/results/k02-semantic-preparation.json` | Record exact hashes, diagnostics and verification evidence. |

Do not apply `scripts/test.ts`, `scripts/testing/inventory.ts`,
`tests/fetchCache.ts`, new native replay/store/control files, `package.json`,
CI files, or the enum-test draft from this candidate. The native author has
separately typed the two remaining `entries` declarations; those changes are
not included in this exact-base mirror.

## Verification and remaining diagnostics

The pinned baseline is 18 errors, 221 warnings and 128 information diagnostics.
The prepared whole mirror has 2 errors, 150 warnings and 128 information
diagnostics. Both remaining errors are the native author's two declarations.
The 31 owned source files pass lint with 0 errors, 54 warnings and 29 information
diagnostics. A negative control confirms a local documented `any` suppression
leaves an adjacent `any` warning and loose-equality error enabled.

| Remaining whole-mirror warning | Count |
| --- | ---: |
| Non-null assertions | 99 |
| `@ts-ignore` | 19 |
| Literal template placeholders | 15 |
| Optional chaining preferences | 6 |
| Arrow-function preferences | 3 |
| Prototype method calls | 2 |
| Global `isNaN` calls | 2 |
| Unused import | 1 |
| Unused variable | 1 |
| Array-check preference | 1 |
| Redundant strict directive | 1 |

Strict project checking passes: 58 library roots/73 files and 103 tools
roots/175 files. The 193 affected cached tests across thirteen files pass under
the maintained Linux offline guard, including the added cleanup precedence
control. The no-write schema gate passes. Two fresh guarded builds compare the
committed base with the candidate: all 108 public declaration ASTs are unchanged
when comments are removed, and all 26 emitted schema copies are byte-identical.
Nineteen changed source files have identical comment-free TypeScript ASTs. The
only comment-free emitted JavaScript changes are cleanup error handling, the
version-cache assignment split and the three string comparisons. No generated
package files are edited or proposed for application.

All 1,201 HTTP fixtures remain byte-identical to the committed base. No Deno
binary, Yahoo request, live fixture write, global setting or shared-source edit
is used. OS/native replay and CI acceptance remain with their separate authors.
Formatting still has its separately recorded baseline debt; this semantic
preparation does not claim a clean formatting gate or completed K02 acceptance.

Suppression syntax follows the official
[Biome suppression documentation](https://biomejs.dev/analyzer/suppressions/).
The independent TypeScript checker remains mandatory; a lint suppression does
not change TypeScript checking or runtime validation.

## Accepted review and combined check

Independent Sol xhigh and Astra xhigh reviews cleared the semantic phase after
the two inaccurate moduleExec explanations were corrected. They independently
verified the affected tests, schema/declaration parity, behavior boundaries and
suppression scope. The original and corrected immutable artifacts remain
identified in the receipt.

A separate working-tree integration check after application includes committed
CI and the then-current native replay draft: lint reports zero errors, 150
existing warnings and 128 information diagnostics across 192 files; strict
checking reports zero diagnostics (library 58 roots/73 files/28 exports, tools
109 roots/181 files). All 1,547 recorded inputs stayed unchanged during those
checks. The native author later continued its separate filename correction;
this integration evidence identifies its exact earlier snapshot. It is not a
final combined replay or CI acceptance claim. Formatting and final command/CI
alignment remain required before K02 is checked complete.
