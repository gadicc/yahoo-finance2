# Plan 012: Preserve and enforce consumer date contracts

> Follow the release boundaries below. Correct PR #1039 and add prevention
> independently of the migration of published contracts. Do not silently fold
> breaking corrections into the schema-repair PR.
>
> Drift check: `git diff --stat 93bb36d..HEAD -- src/modules scripts/schema-gen.ts scripts/schema-repair.ts CONTRIBUTING.md AGENTS.md .github/codex/schema-repair.md .github/workflows/tests.yaml`.
> Compare changed files with the evidence below before implementing.

## Status and scope

- Follow-up implementation: checker and guidance are implemented separately
  from #1039. Published corrections are tracked in GitHub issue #1040,
  milestone v5.0, and `docs/next-major.md`. This audit's original no-edit
  statements below describe the investigation, not the subsequent execution.
- Planned on 2026-10-19 against local `dev` at `93bb36d93ee1dbf013b6c9baf5c4a730f7ad8459`.
- PR #1039 was separately inspected at head `2a49d6f7afafc3b294414b5a9a322bc04cf90ae4`,
  base `8cbd2692d8df26ccd0e0307c6e2b0a39f2203797`. Those objects were not in
  the local checkout; GitHub supplied the PR and its recorded fixture.
- Priority P1; effort M; high confidence. Prevention has low runtime risk;
  migration has high compatibility risk.
- Dependencies: none. Prevention can land before the breaking migration.
- Scope: output date declarations, generated schemas, focused semantic tests,
  contributor/repair guidance, and shared checking of date declarations.
- Exclude generated `npm/`, fixture recaching, unrelated refactors, publishing,
  and the pre-existing untracked `.claude/worktrees/`.
- This is an audit/handoff. Source, tests, schemas, and the remote PR were not
  edited. General security, performance, and unrelated API contracts were not
  audited.

## Why this matters

Interfaces describe the values consumers receive, which can differ from raw
Yahoo JSON. `Date` becomes a `string` schema with `format: "date-time"`;
`src/lib/validate/types/string.ts:20` uses that marker to convert values into
JavaScript dates. A bare `string` schema does not trigger conversion. A number
schema is worse for ISO dates: `src/lib/validate/types/number.ts:21` calls
`Number.parseFloat`, silently reducing a date string to its year.

`src/modules/screener.test.ts:35` currently awaits validation without asserting
the returned dates. Schema generation and replay can therefore both pass with
incorrect consumer values. Do not treat passing validation as proof of semantic
correctness, or make a global change to parseFloat as part of this work.

## Verified findings and release history

| Finding | Evidence and origin | Recommended treatment |
| --- | --- | --- |
| PR #1039 adds `ScreenerQuote.newListingDate?: string` | PR head above; successful recorded IAM quote has `"2026-10-15"`; 12 other quotes omit it. Quote and search already use `Date` (`src/modules/quote.ts:414`, `src/modules/search.ts:126`). | Correct to optional `Date` before merging. No published declaration needs migration. |
| Screener `nameChangeDate` and `ipoExpectedDate` are numbers | `src/modules/screener.ts:628`; successful cached strings include `"2026-10-03"` and `"2021-12-09"` in `screener-undervalued_growth_stocks.json`. Present since initial screener commit `8fb3e3d` (2023-09-28), first released v2.8.0. | Convert to `Date` in a breaking release; add exact-value assertions. |
| Other screener dates/timestamps remain raw | `creationDate`, `lastUpdated`, `firstTradeDateMilliseconds`, `postMarketTime`, `regularMarketTime`, `earningsTimestamp`, `earningsTimestampStart`, `earningsTimestampEnd`, `dividendDate` in `src/modules/screener.ts`. Also originate with the initial screener implementation. | Coordinated major migration. The first three are milliseconds and require `DateInMs`; ordinary second timestamps use `Date`. |
| Screener `exchangeTransferDate?: string` | `src/modules/screener.ts:617`; `screener-aggressive_small_caps.json` contains `"2026-09-30"`. Commit `2760422` (2026-10-04), first released v4.0.3, also present in v4.0.4. Commit explicitly preserved the string and credits Codex. | Recent drift, but already published: recommend the major migration rather than assume nobody uses it. |
| `QuoteOption.expireDate: number` | `src/modules/quote.ts:579`; introduced `1348515` (2021-06-19), first v1.14.0. | Major migration to `Date`; add synthetic OPTION coverage if no successful OPTION fixture remains. |
| `QuoteAltSymbol.expireIsoDate: string` | `src/modules/quote.ts:620`; introduced `2cb023d` (2025-08-24), first v3.6.6. `quote-ZNC=F.json` contains `"2026-09-28T00:00:00Z"`; adjacent `expireDate` is already a `Date`. | Major migration to `Date`. |
| `DefaultKeyStatistics.lastSplitDate?: number` | `src/modules/quoteSummary-iface.ts:188`; number present at least since `f824f88` (2021-02-01), including v1.3.1. AAPL fixture has `1598832000`. | Major migration to `Date`. |
| Inverse error: `sharesShortPriorMonth?: Date` | `src/modules/quoteSummary-iface.ts:164`; AAPL fixture has share count `157008120`. Commit `4cf1f62` (2021-10-24) changed number to Date, first v2.0.0. | Restore `number` in the major migration; assert the count remains unchanged. |

These are not all recent AI errors. The recent exchange-transfer field is one
confirmed example; the largest cluster dates to the original screener module.
The current 2025 blame for some fields reflects restoration after TypeBox,
not their initial introduction.

There are nine current uppercase-suffix `*Date` non-Date declarations: eight
migration candidates and one legitimate quarter-label exception below. This
count excludes PR #1039 and the additional timestamp/inverse errors.

## Reproductions and baseline

Offline validation of the full successful response from the PR's recorded
`screener-small_cap_gainers.json`, using the existing screener schema plus the
PR's proposed property in memory, produced zero errors and:

| Input | PR result | With the corresponding Date schema |
| --- | --- | --- |
| IAM `newListingDate: "2026-10-15"` | string `"2026-10-15"` | Date at `2026-10-15T00:00:00.000Z` |
| NMRA `ipoExpectedDate: "2023-09-15"` | number `2023` | Date at `2023-09-15T00:00:00.000Z` |
| SOS `nameChangeDate: "2026-10-19"` | number `2026` | Date at `2026-10-19T00:00:00.000Z` |

All three Date-schema variants validated without errors. Separately, actual
DefaultKeyStatistics schema validation converted `sharesShortPriorMonth:
157008120` into `1974-12-23T05:22:00.000Z`, also without errors.

- Focused replay: five test files, 156 steps passed.
- Plain full replay discovered the unrelated untracked nested worktree and
  failed typechecking its migration tests.
- `deno task test:replay --ignore=tests/cloudflare,.claude` passed: 96 tests,
  1,333 steps, two ignored. No fixtures were rewritten and no live Yahoo
  requests were made. This baseline is for local `93bb36d`, not a checkout of
  the PR head; the full PR response was independently exercised as above.

## Step 1: Correct PR #1039 without absorbing the breaking migration

In the existing PR branch use:

```ts
/** New listing date reported by Yahoo, normalized to a Date. */
newListingDate?: Date;
```

Keep optionality: omission is demonstrated by successful same-shape quotes.
Generate with `deno task schema src/modules/screener.ts`. The new property
must have `type: "string"` AND `format: "date-time"` in the generated schema.
No runtime converter is necessary.

The bot workflow forbids test edits. Keep that boundary intact. The approved
manual follow-up strengthens the existing shared date-only coercion test in
`src/lib/validate/index.test.ts` with an exact UTC-midnight assertion. Do not
add a bespoke screener test for this ordinary declaration: the date checker,
schema synchronization, and shared coercion coverage protect it. Reserve module
tests for uncovered formats, units, or transformations. Do not recache fixtures.

Update the PR description to say Date normalization rather than preserving an
ISO string. The existing `fix(schema):` treatment is reasonable for correcting
an unmerged declaration of a newly modeled field. Do not describe this as a
patch-safe justification for changing already published declared fields.

Verify with focused replay, then full replay, `deno task check`, `deno lint`,
`deno fmt --check`, and `git diff --check`. Only the intended source, schema,
shared coercion test, and PR description should differ.

## Step 2: Codify the contributor and agent rule

Add a canonical section in CONTRIBUTING.md after Schema Generation. Proposed
text, ready to adapt to local formatting:

> Result interfaces describe the normalized values returned to consumers, not
> just Yahoo's wire representation. Model calendar dates and timestamps as
> `Date` even when successful JSON fixtures contain an ISO string, a Unix
> timestamp in seconds, or a numeric `{ raw, fmt }` wrapper. Use the existing
> `DateInMs` alias for numeric timestamps in milliseconds; do not use ordinary
> `Date` for those values. Regenerate all affected schemas so runtime coercion
> stays aligned with the declaration. Do not add a converter when the existing
> coercion already handles the observed representation.
>
> A `*Date` result property should normally be date-valued, but inspect its
> meaning before changing it. Quarter labels and years are not instants.
> Preserve evidence-backed optionality and nullability. Reuse shared coercion
> coverage for ordinary declarations; add dedicated tests for uncovered formats,
> units, or module-specific transformations. Conversion tests should check the
> returned Date instance AND its exact value. Changes to a
> published result's primitive/Date contract require compatibility review and
> normally a major release, even when correcting an original mistake.

Summarize/link this section from AGENTS.md's Schema And Validation section,
docs/validation.md's contribution guidance, docs/schema-repair.md, and the
trusted repair prompt `.github/codex/schema-repair.md`. Explicitly tell repair
agents to compare parallel interfaces (e.g. quote/search for screener fields),
and distinguish raw fixture shape from normalized output type. Existing
published anomalies are migration debt, not precedent for new fields.

Read-only verify: `deno fmt --check CONTRIBUTING.md AGENTS.md docs/validation.md docs/schema-repair.md .github/codex/schema-repair.md`.

## Step 3: Add a shared output-date contract check

Add `scripts/date-contracts.ts` and focused tests using the existing TypeScript
API exported as `ts` by `ts-json-schema-generator`. Do not implement a regexp
replacement or infer conversions from names at runtime.

1. Check `*Date` properties in schema-bearing module data interfaces,
   including quoted property names and nested data properties. Preserve
   declaration ownership when reporting inherited members. Input/options
   interfaces must be classified separately; do not apply output restrictions
   to legitimate input unions. Start with uppercase suffix `Date`; broader
   timestamp naming rules can follow explicit inventory.
2. Accept `Date`, the existing `DateInMs` alias, date arrays (including
   `Array<Date>`), parentheses, optional fields, and date/null unions. Resolve
   aliases/references conservatively: an arbitrary alias name is not proof of
   date semantics. Do not accept `Date | string` as satisfying the rule for a
   normalized output. A generated-schema check can verify the final
   `date-time` marker through references/unions/arrays too.
3. Maintain exact file/interface/property/type exceptions in trusted tooling.
   Separate permanent semantic exceptions from temporary published-contract
   debt. Give each a reason and, for debt, its removal target. Prevent invalid
   type changes under a grandfathered name; reject stale entries after a
   field is removed or normalized. No file-wide or property-name-only bypass.
4. Invoke the checker before schema generation writes output, including paths
   that would otherwise skip generation by timestamp. Existing CI runs
   `deno task schema:check`, so it will inherit the check.
5. Invoke the same trusted checker from `scripts/schema-repair.ts` for proposed
   sources and the final independently verified source set. Pass file context
   into it for exact exceptions. The verifier runs scripts from its trusted
   checkout against candidate text; retain that boundary. Repair proposals
   must not modify the checker, add an allowlist entry, or obtain permission
   merely through candidate JSDoc.

Known semantic exceptions:

- `EarningsChart.currentQuarterEstimateDate?: string` is a quarter label such
  as `"2Q"` (`quoteSummary-earnings-GOOG.json:84`). Keep it a string.
- If checking lowercase `date` later, earnings/financial chart quarter labels,
  year numbers, and Filing source text paired with `epochDate` need explicit
  treatment. `OptionsOptions.date` is user input (`Date | number | string`),
  not an output contract.
- `creationDate` is not a semantic exception: its milliseconds need
  `DateInMs` when its published contract is eventually migrated.

Meaningful tests must reject the exact PR #1039 string addition, a numeric
date addition, Date-to-string regression, a changed legacy exception type,
unknown/overbroad aliases, and an unapproved exception. Accept Date,
DateInMs, arrays, nullability, optionality, the exact quarter exception, and
unchanged legacy entries. Verify nested and quoted properties and stale entry
removal. Extend `scripts/schema-repair.test.ts` to prove the trusted repair
path rejects raw string/number dates. The existing guard currently accepts
`newListingDate?: string`; this was independently reproduced.

Verify with `deno task test:replay scripts/date-contracts.test.ts scripts/schema-repair.test.ts scripts/schema/createGenerator.test.ts`,
schema regeneration/checking, full replay, typechecking, lint and format
checks. Use in-memory source/schema tests as in
`scripts/schema/createGenerator.test.ts`; avoid requiring filesystem access
outside the normal replay test permissions.

## Step 4: Stage the published corrections for a major release

Do not execute this step as part of PR #1039. Normalize the eight published
non-Date `*Date` candidates, associated screener timestamps, and the inverse
share-count error together. Preserve existing optionality. Import `DateInMs`
with local `.ts` import extensions as elsewhere in the repo.

Regenerate explicitly, because imported-type dependencies are not tracked by
the generator's timestamp optimization:

```sh
deno task schema src/modules/screener.ts src/modules/quote.ts src/modules/options.ts src/modules/quoteSummary-iface.ts src/modules/quoteSummary.ts
```

Test consumers of shared quote schemas, including options. Add exact-value
assertions for seconds, milliseconds, ISO date-only/ISO timestamp strings,
omission, and the share count. Add migration notes to UPGRADING.md showing
changes from numeric arithmetic/string operations to Date methods; consumers
of the erroneous share-count Date need the restored numeric value.

Use a Conventional Commit breaking marker/body, e.g.
`fix(dates)!: normalize published date and share-count results`, with a
`BREAKING CHANGE:` explanation. Do not push or publish without a separate
request. Recency alone is not proof that a published change is patch-safe.

Repository precedent is especially strong: commit
`4cf1f624d55d92f80db4b36b3afe9414f5eb5a3c` / PR #264 explicitly treated an
unintentional number-to-Date correction as breaking and shipped in v2.0.0.
This matches https://semver.org/spec/v2.0.0.html, clauses 6 and 8.

## Done criteria and stop conditions

- PR #1039 declares optional Date, generates date-time format, and strengthens
  the shared date-only coercion test with an exact UTC-midnight assertion.
- Canonical guidance and agent/repair summaries agree on output semantics.
- Ordinary schema CI and trusted repair verification reject new raw date
  declarations using the same checker and exact, documented exceptions.
- Published primitive/Date corrections remain separate from the immediate PR
  unless implementing the explicitly breaking migration.
- Focused and full replay, typecheck, lint, format, schema synchronization, and
  `git diff --check` pass; inspect generated diffs and final status.
- Do not recache as verification. Stop for HTTP/API errors, unexpected fixture
  units, unsupported date strings, uncertain field semantics, or a required
  runtime conversion change. Do not loosen a type or alter numeric parsing to
  conceal the mismatch.
- Leave unrelated local work untouched. In this checkout use
  `--ignore=tests/cloudflare,.claude` for full replay to exclude nested worktree
  tests; in a clean checkout use normal `deno task test:replay`.
- Update this plan's README status after the corresponding work lands. Remove
  temporary legacy exceptions during the major migration; do not let them
  become permanent convention.
