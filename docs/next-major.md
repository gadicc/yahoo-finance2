# Next major release checklist

Before preparing v5, review every `next-major` entry in
[the date contract checker](../scripts/date-contracts.ts) and
[issue #1040](https://github.com/gadicc/yahoo-finance2/issues/1040), assigned to
the [v5.0 milestone](https://github.com/gadicc/yahoo-finance2/milestone/3).
These are published API mistakes deliberately preserved until the next major.
They are not patterns to copy into new declarations.

## Normalize published date contracts

| Interface              | Fields                                                                | Current type | v5 type    |
| ---------------------- | --------------------------------------------------------------------- | ------------ | ---------- |
| `ScreenerResultBase`   | `creationDate`, `lastUpdated`                                         | `number`     | `DateInMs` |
| `ScreenerQuote`        | `firstTradeDateMilliseconds`                                          | `number`     | `DateInMs` |
| `ScreenerQuote`        | `postMarketTime`, `regularMarketTime`                                 | `number`     | `Date`     |
| `ScreenerQuote`        | `earningsTimestamp`, `earningsTimestampStart`, `earningsTimestampEnd` | `number`     | `Date`     |
| `ScreenerQuote`        | `dividendDate`, `nameChangeDate`, `ipoExpectedDate`                   | `number`     | `Date`     |
| `ScreenerQuote`        | `exchangeTransferDate`                                                | `string`     | `Date`     |
| `QuoteOption`          | `expireDate`                                                          | `number`     | `Date`     |
| `QuoteAltSymbol`       | `expireIsoDate`                                                       | `string`     | `Date`     |
| `DefaultKeyStatistics` | `lastSplitDate`                                                       | `number`     | `Date`     |
| `DefaultKeyStatistics` | `sharesShortPriorMonth`                                               | `Date`       | `number`   |

The first three fields in the table contain milliseconds; ordinary `Date`
coercion interprets numeric input as seconds. The share-count field is an
inverse error: its value is a count, not a timestamp. Currently an AAPL
fixture's count `157008120` becomes `1974-12-23T05:22:00.000Z`. ISO strings in
screener's numeric `nameChangeDate` and `ipoExpectedDate` fields are silently
truncated to their years by numeric coercion. All these results can pass
validation today.

- [ ] Correct the declarations, preserving evidence-backed optionality.
- [ ] Remove each corresponding temporary checker exception as it is fixed.
- [ ] Regenerate every affected schema, including shared consumers such as
      options after quote changes.
- [ ] Assert both returned types and exact values using successful fixtures.
      Include milliseconds, seconds, date-only/ISO strings, and the share count.
- [ ] Add migration examples to [UPGRADING.md](./UPGRADING.md), including Date
      methods replacing numeric/string operations and the restored share count.
- [ ] Use a breaking Conventional Commit and publish through the major-release
      process. Close #1040 only when the migration and release guidance are
      done.

Keep the permanent `EarningsChart.currentQuarterEstimateDate: string` exception:
it contains quarter labels such as `"2Q"`. Lowercase chart `date` labels/years
and user-input date unions are also distinct from normalized output instants.

The older anomalies span v1–v3; `exchangeTransferDate` shipped in v4.0.3.
[PR #264](https://github.com/gadicc/yahoo-finance2/pull/264) established that an
accidental primitive-to-Date correction still changes a published contract and
is breaking. Correcting the unmerged `newListingDate` addition in
[#1039](https://github.com/gadicc/yahoo-finance2/pull/1039) is separate from
this migration.
