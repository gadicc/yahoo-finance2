# MIGRATION GUIDE

Please read this guide when upgrading MAJOR VERSIONS of the package, list the
BREAKING CHANGES and required changes you'll need to make to your code.

- [From v2 to v3](#from-v2-to-v3) (2025)
- [From v1 to v2](#from-v1-to-v2) (2021)

<a name="from-v2-to-v3"></a>

## Upgrading from v2 to v3 (2025)

**v3 is now official and published with the @latest tag**, to upgrade:

```bash
$ npm install yahoo-finance2@latest
```

Despite the major version change, and significant changes under-the-hood, most
of the library retains a familiar API.

The most impactful change is how to initialize the library, as explained by this
diff:

```diff
- import yahooFinance from "yahoo-finance2";
- yahooFinance.setGlobalConfig(options); // optional
- yahooFinance.suppressNotices["yahooSurvey"]; // optional

+ import YahooFinance from "yahoo-finance2";
+ const yahooFinance = new YahooFinance({
+   ...options, // optional
+   suppressNotices: ["yahooSurvey"], // optional
+ });
```

i.e., the default import is now a `YahooFinance` class which needs to be
instantiated before use with `new YahooFinance()`.

Other notable changes:

- `dailyGainers` and `dailyLosers` were removed. Please use the `screener()` API
  instead, with e.g.
  `yahooFinance.screener({ scrIds: "day_gainers", count: 5 })`, or
  `"day_losers"`, etc. More info in the docs.

- **Running directly in the browser** is no longer supported. You should perform
  the request to Yahoo Finance from a server / serverless / edge environment and
  send that data on to the client. Works great with React Server Components,
  `trpc`, etc. XXX TODO helper APIs XXX

- Not specific to v3, but sometime back, Yahoo moved a lot of financial data
  from `quoteSummary` to
  [`fundamentalsTimeSeries`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/fundamentalsTimeSeries).
  The old quoteSummaryry `balanceSheetHistory`, `cashFlowStatementHistory` and
  `incomeStatementHistory` return very little data now.

- **If we missed anything out, please let us know!** Just open an issue.

<a name="dev"></a>

**Development**:

There were significant changes to the development environment, please see the
[CONTRIBUTING.md](../CONTRIBUTING.md) file for more details.

Additionally, the repository was renamed `node-yahoo-finance2` to
`yahoo-finance2`, and the branches `master` and `devel` were renamed to `main`
and `dev`, respectively. To update your local git:

```bash
# or for HTTPS: git remote set-url origin https://github.com/gadicc/yahoo-finance2.git
git remote set-url origin git@github.com:gadicc/yahoo-finance2.git
# or for forks: git remote set-url upstream git@github.com:gadicc/yahoo-finance2.git

git branch -m devel dev
git branch -m master main
git fetch origin
git branch -u origin/dev dev
git branch -u origin/main main
git remote set-head origin -a
```

<a name="from-v1-to-v2"></a>

## Upgrading from yahoo-finance v1 to v2 (2021)

Table of Contents

1. [General](#general)
2. [historical()](#historical)
3. [quote()](#quote)

<a name="general"></a>

## General

1. **symbol**: The most common change is that in v1, we accepted a `symbol` key
   in the `options` dictionary. In v2, the `symbol` is usually the first
   _parameter_ to the function call. This is a lot more comfortable, as most
   APIs take a single, required symbol or query parameter, and `options` are
   usually optional. See the examples below.

1. **validation** and **typescript**: we go to much greater lengths to ensure
   that the data you get is consistent, even though Yahoo often change their
   API. If you use the optional typescript, you get a lot of help and hints as
   to what the query result will look like. See the
   [validation docs](./validation.md) for further info.

<a name="quote"></a>

## quote()

**NB: v1's `quote()` relates to v2's `quoteSummary()`**. This was an unfortunate
lack of foresight on our part in v1 without releasing Yahoo's API had an
entirely different `quote` API too. In v2, we align exactly with Yahoo's API
naming.

The function signature has changed slightly, to remain consistent with the rest
of the library.

```js
// V1 took a single OPTIONS object as the only paramater
// The API was called "quote" (in v2, it's "quoteSummary")
yahooFinanceV1.quote({ symbol, modules });
{
  // Depends on modules argument:
  price: { /* ... */ },
  summaryDetail: { /* ... */ },
}

// V2 takes SYMBOL as 1st parameter, OPTIONS as 2nd.
// The API is called "quoteSummary" (in v1, it's "quote")
yahooFinanceV2.quoteSummary(symbol, { modules });
{
  // The output should otherwise be identical.
  // Please open an issue if you find any edge-cases.
}
```

**Query**

| Attribute | v1                       | v2+                              |
| --------- | ------------------------ | -------------------------------- |
| `symbol`  | As a `{ symbol }` option | First argument to quoteSummary() |
| `modules` | Remains the same         | Remains the same                 |

Note: v1 could also accept a `symbols` key (note the "s" at the end for plural).
In v2 we accept a single symbol only, which more closely aligns to a single
network request being made.

**Results**

| Attribute | v1                          | v2+                         |
| --------- | --------------------------- | --------------------------- |
| `symbol`  | Was included in each result | Not included in each result |

<a name="historical"></a>

## historical()

The function signature has changed slightly, to remain consistent with the rest
of the library.

```js
// V1 took a single OPTIONS object as the only paramater
yahooFinanceV1.historical({ symbol, from, to });
[
  {
    date,
    open,
    high,
    low,
    close,
    adjClose,
    volume,
    symbol, // was included
  },
  // ...
];

// V2 takes SYMBOL as 1st parameter, OPTIONS as 2nd.
yahooFinanceV2.historical(symbol, { period1 });
[
  {
    date,
    open,
    high,
    low,
    close,
    adjClose,
    volume,
    // symbol NOT included
  },
  // ...
];
```

**Query**

| Attribute | v1                       | v2+                                                                                            |
| --------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `symbol`  | As a `{ symbol }` option | First argument to historical()                                                                 |
| `fields`  | `{ from, to }`           | `{ period1, period2 }`. Period2 defaults to now().                                             |
| dates     | "YYYY-MM-dd"             | JS Date object, or any format `new Date()` understands , so "YYYY-MM-dd" still works fine too. |

**Results**

| Attribute | v1                          | v2+                         |
| --------- | --------------------------- | --------------------------- |
| `symbol`  | Was included in each result | Not included in each result |
