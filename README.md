# yahoo-finance2

Community API for Yahoo-Finance.

Copyright (c) 2021 by Gadi Cohen and Pilwon Huh. [MIT licensed](./LICENSE).

[![npm](https://img.shields.io/npm/v/yahoo-finance2)](https://www.npmjs.com/package/yahoo-finance2)
[![Tests](https://github.com/gadicc/yahoo-finance2/actions/workflows/tests.yaml/badge.svg)](https://github.com/gadicc/yahoo-finance2/actions/workflows/tests.yaml)
[![coverage](https://img.shields.io/codecov/c/github/gadicc/yahoo-finance2)](https://codecov.io/gh/gadicc/yahoo-finance2)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

You are reading the latest **Development docs**. For the **v2 docs**, click
[here](https://github.com/gadicc/yahoo-finance2/tree/2.x). The dev docs are in
the process of being updated for the upcoming **v3** - for more info see
[UPGRADING](./docs/UPGRADING.md).

[Live Demo on CodeSandbox](https://codesandbox.io/p/devbox/yahoo-finance2-nextjs-forked-233dsg)
(Updated 2024-06-17; NextJS with both RSC and Hook-Relay examples)

NB: Recently **the repo was renamed** from `node-yahoo-finance2` to
`yahoo-finance2`, and the following **branches were named**, `master` to `main`,
and `devel` to `dev`. See [UPGRADING.md#dev](./docs/UPGRADING.md#dev) for the
git commands to update your local installation.

## Supported runtimes:

- **Bun**: v1+.
- **Cloudflare**: Modern releases (we support but don't test for this, please
  report issues).
- **Deno**: v2+.
- **Node**: [Current and Active LTS](https://endoflife.date/nodejs) only; v20
  until 2026-04-30, v22 until 2027-04-30, v24 until 2028-04-30.

## Unofficial API

This project is neither created nor endorsed by Yahoo Inc. Yahoo does not
provide any official API to developers, nor makes any guarantees regarding
service availability or API consistency. In practice however, the open source
community has kept this project (and it's predecessor) working well since 2013.

Nevertheless, we make no guarantees and you use this package at your own risk.
The developers (and obviously Yahoo) cannot be held responsible for any losses
you may incur as a result of using this service. Use of this package is
considered acknowledgement and acceptance of these terms and of its license.

## Quickstart

**CLI** (Command line interface)

```bash
$ npx yahoo-finance2 --help
$ npx yahoo-finance2 search AMZN
$ npx yahoo-finance2 quoteSummary GOOGL
$ npx yahoo-finance2 quoteSummary NVDA '{"modules":["assetProfile", "secFilings"]}'

# or install it
$ npm install -g yahoo-finance2
$ yahoo-finance search MSFT '{ "someOption": true }'
```

**Importing**

```ts
// or: const YahooFinance = require("yahoo-finance2").default;
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const results = await yahooFinance.search("Apple");

const quote = await yahooFinance.quote('AAPL');
const { regularMarketPrice as price, currency } = quote;
```

Available modules:
[`chart`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/chart),
[`fundamentalsTimeSeries`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/fundamentalsTimeSeries),
[`historical`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/historical),
[`insights`](https://jsr.io/@gadicc/yahoo-finance2/doc/moduless/insights),
[`options`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/options),
[`quote`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/quote),
[`quoteSummary`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/quoteSummary)
(submodules: assetProfile, balanceSheetHistory, balanceSheetHistoryQuarterly,
calendarEvents, cashflowStatementHistory, cashflowStatementHistoryQuarterly,
defaultKeyStatistics, earnings, earningsHistory, earningsTrend, financialData,
fundOwnership, fundPerformance, fundProfile, incomeStatementHistory,
incomeStatementHistoryQuarterly, indexTrend, industryTrend, insiderHolders,
insiderTransactions, institutionOwnership, majorDirectHolders,
majorHoldersBreakdown, netSharePurchaseActivity, price, quoteType,
recommendationTrend, secFilings, sectorTrend, summaryDetail, summaryProfile,
symbol, topHoldings, upgradeDowngradeHistory),
[`recommendationsBySymbol`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/recommendationsBySymbol),
[`screener`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/screener),
[`search`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/search),
[`trendingSymbols`](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/trendingSymbols).

Extras:
[`quoteCombine`](https://jsr.io/@gadicc/yahoo-finance2/doc/other/quoteCombine).

See the [Explanatatory Documentation](./docs/README.md) and
[Full API Documentation](https://jsr.io/@gadicc/yahoo-finance2/doc/~/default).

Particularly, make sure to read the notes there on
[ERROR HANDLING](./docs/README.md#error-handling). Be aware that if a stock gets
delisted, Yahoo removes all related data, including historical (and chart) data
from periods _before_ the delisting occurred (i.e. queries that worked before
will start failing, and there is no way to retrieve this data again).

## (Optional) TypeScript Love

Working with `yahoo-finance2` is a joy if you're using TypeScript (but you don't
have to), with type checking and auto completion:

![Types Animation](./docs/img/yf-typescript-demo.gif)

Try it yourself on our
[Live CodeSandbox](https://codesandbox.io/s/yahoo-finance2-312x2?file=/src/index.ts).

## Using in the Browser

It's not possible to run this in the browser, due to CORS and cookie issues. You
should execute calls on a server or in a serverless or edge function, and pass
this data to the browser as required. See the CodeSandbox above for examples.
Use React Server Components, trpc, or other strategies to maintain types.

## Related Projects

- 📈 [Ghostfolio](https://ghostfol.io/) - mature, open-source Wealth Management
  & longtime supporter.

- 🛠️ [StockQuotes.MCP](https://github.com/lionelschiepers/StockQuotes.MCP) - AI
  MCP Server to fetch real time financial data

Want your project listed? Open a PR to add it here.

## Contributing

Pull Requests welcome! Read [CONTRIBUTING.md](./CONTRIBUTING.md) and join our
list of heroes:

<!--
![contributor-faces](https://contributors-svg.vercel.app/api/svg?user=gadicc&repo=yahoo-finance2)
-->

![contributors badge](https://readme-contribs.as93.net/contributors/gadicc/yahoo-finance2)

## Credits

- Massive thanks to [@pilwon](https://github.com/pilwon) for the original
  [node-yahoo-finance](https://www.npmjs.com/package/yahoo-finance) and for all
  our prior collaborations on this and other projects 🙏

- Special mention goes out to [pudgereyem](https://github.com/pudgereyem) and
  [PythonCreator27](https://github.com/PythonCreator27) who made significant
  contributions in the very early days of this project.
