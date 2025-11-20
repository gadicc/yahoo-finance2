## [2.13.4](https://github.com/gadicc/node-yahoo-finance2/compare/v2.13.3...v2.13.4) (2025-11-20)


### Bug Fixes

* **index:** deprecation warning for v2. ([66c54e7](https://github.com/gadicc/node-yahoo-finance2/commit/66c54e7507ac758ff953696dedf9b9425d4c26e2))
* **release:** explicit 2.x branch, s/master/main/ ([aaa09e3](https://github.com/gadicc/node-yahoo-finance2/commit/aaa09e387726fa0e3b7ff377f1cb8c3e1d4bb747))
* **release:** fix range ([e0cfbe9](https://github.com/gadicc/node-yahoo-finance2/commit/e0cfbe98f222597899fefedb937483ea5e95bd08))

## [2.13.3](https://github.com/gadicc/node-yahoo-finance2/compare/v2.13.2...v2.13.3) (2024-12-21)


### Bug Fixes

* **chart:** validate includePrePost:false, interval:1m (fixes [#812](https://github.com/gadicc/node-yahoo-finance2/issues/812)) ([5ca811d](https://github.com/gadicc/node-yahoo-finance2/commit/5ca811d601341d2b81d1d5fb495c88eac08e2dcb))
* **fetchDevel:** fix application/json detection ([cc0390a](https://github.com/gadicc/node-yahoo-finance2/commit/cc0390a15ff2e40cffab79e3a67fd7d2d4186dac))
* **fetchDevel:** use std Headers methods in contentObj ([#826](https://github.com/gadicc/node-yahoo-finance2/issues/826)) ([46273db](https://github.com/gadicc/node-yahoo-finance2/commit/46273db88a8efbe5779d69a31aabce061b270c09))
* **notices:** fix typo in log: s/supress/suppress/ (fixes [#845](https://github.com/gadicc/node-yahoo-finance2/issues/845)) ([0e47049](https://github.com/gadicc/node-yahoo-finance2/commit/0e470497e55b781f8890065c7268e5a9c2eafebe))


### Reverts

* Revert "chore(tests): temporarily disable getCrumb tests on CI" ([6f48387](https://github.com/gadicc/node-yahoo-finance2/commit/6f48387e54c6a6eec3e16a3093f9cc6b631ee334))
* Revert "chore(tests): different approach for weird CI getCrumb test issue" ([d595714](https://github.com/gadicc/node-yahoo-finance2/commit/d59571472b00ebeeb5c647579409b4ab5087d1ee))

## [2.13.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.13.1...v2.13.2) (2024-10-04)


### Bug Fixes

* **chart:** validate includePrePost:false, interval:1m (fixes [#812](https://github.com/gadicc/node-yahoo-finance2/issues/812)) ([b272c48](https://github.com/gadicc/node-yahoo-finance2/commit/b272c485d677b1394f9610e3978ea9861b4ad50b))


### Reverts

* Revert "chore(tests): temporarily disable getCrumb tests on CI" ([a234d60](https://github.com/gadicc/node-yahoo-finance2/commit/a234d60b7cb54c75bf9cd0be7808b8183280a65e))
* Revert "chore(tests): different approach for weird CI getCrumb test issue" ([d0fea98](https://github.com/gadicc/node-yahoo-finance2/commit/d0fea98eb29bd6f86abb309edc5d80b86c529db6))

## [2.13.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.13.0...v2.13.1) (2024-10-02)


### Bug Fixes

* **quoteSummary:** re-add missing modules except insiderHolders ([#797](https://github.com/gadicc/node-yahoo-finance2/issues/797)) ([d862806](https://github.com/gadicc/node-yahoo-finance2/commit/d862806c89b44336fbbd63630a5b903279a08393))

# [2.13.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.12.5...v2.13.0) (2024-09-29)


### Bug Fixes

* **options:** re-export missing types ([#797](https://github.com/gadicc/node-yahoo-finance2/issues/797)) ([e96395f](https://github.com/gadicc/node-yahoo-finance2/commit/e96395f5ad21a92c53d068fdcf248e4465aecfed))
* **setGlobalConfig:** cookieJar prop should be optional (fixes [#809](https://github.com/gadicc/node-yahoo-finance2/issues/809)) ([7e524fc](https://github.com/gadicc/node-yahoo-finance2/commit/7e524fceba6cf2b2042bee7e913e4b04388643fc))


### Features

* **quote:** export `QuoteField` type ([#808](https://github.com/gadicc/node-yahoo-finance2/issues/808)) ([a1f07d7](https://github.com/gadicc/node-yahoo-finance2/commit/a1f07d70171fa9b19ac26d58aefdbda6373a3ba0))

## [2.12.5](https://github.com/gadicc/node-yahoo-finance2/compare/v2.12.4...v2.12.5) (2024-09-28)


### Bug Fixes

* **deps:** update dependency tough-cookie to v4.1.4 ([a5f8ed4](https://github.com/gadicc/node-yahoo-finance2/commit/a5f8ed403ed2d741dc67ef552455c4897381d1cd))
* **json:** keep assertions; use "with"; up min node ver (closes [#800](https://github.com/gadicc/node-yahoo-finance2/issues/800)) ([45cc33a](https://github.com/gadicc/node-yahoo-finance2/commit/45cc33aaf2e797a7c1452c9c9f324e5bc370dec6))
* **json:** revert keepImportAssertions=false (just for swc/jest) ([0a3e98d](https://github.com/gadicc/node-yahoo-finance2/commit/0a3e98d3370d6f8a96863a720cf16a2925018377))
* **validation:** only log error part of errror (w/o schema, value) ([859a0fb](https://github.com/gadicc/node-yahoo-finance2/commit/859a0fbd826d85f94d2905f304fda63be0d12a9e))

## [2.12.4](https://github.com/gadicc/node-yahoo-finance2/compare/v2.12.3...v2.12.4) (2024-09-20)


### Bug Fixes

* **historical:** correctly map adjclose -> adjClose ([#795](https://github.com/gadicc/node-yahoo-finance2/issues/795)) ([d8851ec](https://github.com/gadicc/node-yahoo-finance2/commit/d8851ecc8169c7f6d7c1283109e60dc55ee989e6))
* **historical:** return coerced values ([#797](https://github.com/gadicc/node-yahoo-finance2/issues/797)) ([386bf82](https://github.com/gadicc/node-yahoo-finance2/commit/386bf8222a43f3dc58fafac876925cb0446efba8))

## [2.12.3](https://github.com/gadicc/node-yahoo-finance2/compare/v2.12.2...v2.12.3) (2024-09-18)


### Bug Fixes

* **chart,options:** fix types after last commit ([#797](https://github.com/gadicc/node-yahoo-finance2/issues/797)) ([27150e6](https://github.com/gadicc/node-yahoo-finance2/commit/27150e62c99389809ce8670841f9d61faef33bf9))
* **historical:** add missing types, colocate types with schema ([#797](https://github.com/gadicc/node-yahoo-finance2/issues/797)) ([5ca349e](https://github.com/gadicc/node-yahoo-finance2/commit/5ca349e4cb924eae5b042641358232f699085095))
* **types:** use StaticDecode vs Static to infer types ([#797](https://github.com/gadicc/node-yahoo-finance2/issues/797)) ([696baf6](https://github.com/gadicc/node-yahoo-finance2/commit/696baf6acd0c83adcac5a48a868c91e128f14bbc))

## [2.12.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.12.1...v2.12.2) (2024-09-17)


### Bug Fixes

* **moduleExec:** actually return coerced values :) ([94430d8](https://github.com/gadicc/node-yahoo-finance2/commit/94430d82d139880fabfa72ba42dc4f61129d7960))
* **modules:** re-export types, conform to *Schema convention ([#795](https://github.com/gadicc/node-yahoo-finance2/issues/795)) ([4269556](https://github.com/gadicc/node-yahoo-finance2/commit/42695567c721f04b2bb9bd3f9804129ca8c5d6b4))

## [2.12.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.12.0...v2.12.1) (2024-09-16)


### Bug Fixes

* **historical:** re-add / adapt old null row filter ([63c4498](https://github.com/gadicc/node-yahoo-finance2/commit/63c449894e50a2803ef40dd0bd100f1fbb6965cc))
* **options:** fix default log.warn() to use console.warn not .error ([4693dbb](https://github.com/gadicc/node-yahoo-finance2/commit/4693dbb8241363614608383b2fc6794e8867e8ad))

# [2.12.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.11.3...v2.12.0) (2024-09-16)


### Bug Fixes

* **chart:** fix and improve non-Date handling code for periods ([f1106c2](https://github.com/gadicc/node-yahoo-finance2/commit/f1106c2098736c55a34f0075c3d65f766cdcca63))
* **circleci,readme:** use node:18.0.0 for tests, make clear in readme ([8365a90](https://github.com/gadicc/node-yahoo-finance2/commit/8365a90a74bd0a79c06bb7ef9d9bc765a7800043))
* **historical:** map requests to chart() with deprec notice ([#795](https://github.com/gadicc/node-yahoo-finance2/issues/795)) ([c212df9](https://github.com/gadicc/node-yahoo-finance2/commit/c212df9ffeea804eb71ab9c598a6766b0b938e7e))
* **imports:** add import assertions required in node since 17.5.0. ([7d0deea](https://github.com/gadicc/node-yahoo-finance2/commit/7d0deea26891da80f2d59c2143b159be2c7a871a))
* **imports:** specify ".js" on local imports for full ESM compat ([46ee6c1](https://github.com/gadicc/node-yahoo-finance2/commit/46ee6c1c5e6e74066c68633bd0dc6b08719b37e6))
* **index:** remove erroneously removed moduleExec import ([fe1a493](https://github.com/gadicc/node-yahoo-finance2/commit/fe1a493fd8001460527d2b77d60d6dabeb542ab2))
* **notices:** historical() note, type improvement, onceOnly text ([c131e5c](https://github.com/gadicc/node-yahoo-finance2/commit/c131e5c475a49066c954005dada5a79d6e5e5c94))
* **pkg/scripts:** still need `prepublishOnly` to run `build` ([4da1273](https://github.com/gadicc/node-yahoo-finance2/commit/4da12730fd7319dc8ed137639eb499dc06e2fead))
* **pkg:** add babel importAttributes plugin ([e41f65d](https://github.com/gadicc/node-yahoo-finance2/commit/e41f65d55e0180a47604c737ef0d8f367512ebe6))
* **pkg:** drop ts-jest, use [@swc-jest](https://github.com/swc-jest), { keepImportAssertions: false } ([a0e2847](https://github.com/gadicc/node-yahoo-finance2/commit/a0e28471aef2cc63ae080d7da9fb779ac57e6574))
* **pkg:** use swc, remove babel (faster, fixes import assertions) ([110d28d](https://github.com/gadicc/node-yahoo-finance2/commit/110d28d3344e12c7a1d3a28eb19e2603db5c64b9))
* **tests-modules:** use swc here too ([c7e849c](https://github.com/gadicc/node-yahoo-finance2/commit/c7e849cf900094fd00e5433ea10a5d74ca44ef2c))


### Features

* **notices:** notices lib, refactor, use for "yahooSurvey" ([#783](https://github.com/gadicc/node-yahoo-finance2/issues/783)) ([b4c016b](https://github.com/gadicc/node-yahoo-finance2/commit/b4c016b82743d394e89e828b23cf2b171a58d543))

## [2.11.3](https://github.com/gadicc/node-yahoo-finance2/compare/v2.11.2...v2.11.3) (2024-05-30)


### Bug Fixes

* **getCrumb:** ignore (but log) unexpected redirect (fixes [#777](https://github.com/gadicc/node-yahoo-finance2/issues/777)) ([2e4c0b4](https://github.com/gadicc/node-yahoo-finance2/commit/2e4c0b4fc127f53387d3b2c35f29a5d2b893ef24))

## [2.11.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.11.1...v2.11.2) (2024-04-17)


### Bug Fixes

* **getCrumb:** use getcrumb endpoint to get the crumb (fixes [#764](https://github.com/gadicc/node-yahoo-finance2/issues/764)) ([db0151c](https://github.com/gadicc/node-yahoo-finance2/commit/db0151c5f595632af0251c24f4bd91aa21af1239))

## [2.11.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.11.0...v2.11.1) (2024-04-05)


### Bug Fixes

* **cookieJar:** re-export ExtendedCJ from package root (fixes [#761](https://github.com/gadicc/node-yahoo-finance2/issues/761)) ([5f99351](https://github.com/gadicc/node-yahoo-finance2/commit/5f993518882338b24d1d47f7a0f724869d7c7c06))

# [2.11.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.10.0...v2.11.0) (2024-03-20)


### Bug Fixes

* **pkg:** commit yarn.lock with @types/har-format ([b1270b5](https://github.com/gadicc/node-yahoo-finance2/commit/b1270b584ecfbfd17a83591c4781cdca4113c54a))


### Features

* **fundamentalsTimeSeries:** improved financial reports ([#753](https://github.com/gadicc/node-yahoo-finance2/issues/753)) ([188860a](https://github.com/gadicc/node-yahoo-finance2/commit/188860a166be56d914d7c453dfcd73790962add7))

# [2.10.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.9.2...v2.10.0) (2024-03-09)


### Features

* **module:** Add new fundamentals time series module ([#748](https://github.com/gadicc/node-yahoo-finance2/issues/748)) ([1681d33](https://github.com/gadicc/node-yahoo-finance2/commit/1681d334fb220738001dea44821464f2c1262e61))

## [2.9.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.9.1...v2.9.2) (2024-03-07)


### Bug Fixes

* **quoteSummary:** stdDev ? in FPerfRiskOverviewStatsRow (fix [#744](https://github.com/gadicc/node-yahoo-finance2/issues/744)) ([fc1430e](https://github.com/gadicc/node-yahoo-finance2/commit/fc1430ea2b36e8f41321d91ecaf6aba49939f1ee))

## [2.9.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.9.0...v2.9.1) (2024-02-05)


### Bug Fixes

* **options:** add { needsCrumb: true } (fixes [#736](https://github.com/gadicc/node-yahoo-finance2/issues/736)) ([79e33d9](https://github.com/gadicc/node-yahoo-finance2/commit/79e33d936fc2401d431e8f0e366a389dccd25903))
* **quoteSummary:** allow totalOtherIncomeExpenseNet null (fixes [#734](https://github.com/gadicc/node-yahoo-finance2/issues/734)) ([1d0d48e](https://github.com/gadicc/node-yahoo-finance2/commit/1d0d48e3d5c1592d73676a4a05bfb0eedcaeb01a))
* **quoteSummary:** moduleName s/search/quoteSummary/ fix ([bf58aa8](https://github.com/gadicc/node-yahoo-finance2/commit/bf58aa8632b1d3c3a2be3f85f7dde78fdc44cf92))

# [2.9.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.8.1...v2.9.0) (2023-11-20)


### Bug Fixes

* **deps:** update dependency @types/tough-cookie to v4.0.5 ([ffb5108](https://github.com/gadicc/node-yahoo-finance2/commit/ffb510807073f8e730074a0423bbb645882da6ae))


### Features

* **quote:** add beta to quote field option ([#713](https://github.com/gadicc/node-yahoo-finance2/issues/713)) ([be20a87](https://github.com/gadicc/node-yahoo-finance2/commit/be20a871b982c5d3be2e0bdbe998f648e1f26522))

## [2.8.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.8.0...v2.8.1) (2023-10-23)


### Bug Fixes

* **assetProfile:** Add `sectorKey` and `industryKey` ([#689](https://github.com/gadicc/node-yahoo-finance2/issues/689)) ([3104739](https://github.com/gadicc/node-yahoo-finance2/commit/3104739dce98d16c09bdf29857ff6ff6e1a5ae51))
* **deps:** update dependency @types/tough-cookie to v4.0.4 ([120574c](https://github.com/gadicc/node-yahoo-finance2/commit/120574ccbccd2470b297c1ced33d201a4a425ddb))

# [2.8.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.7.1...v2.8.0) (2023-09-28)


### Features

* **module:** add screener ([#688](https://github.com/gadicc/node-yahoo-finance2/issues/688)) ([8fb3e3d](https://github.com/gadicc/node-yahoo-finance2/commit/8fb3e3d5ae5728ef7e412902aa8e9c3f6d4cd9f7))

## [2.7.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.7.0...v2.7.1) (2023-09-27)


### Bug Fixes

* **deps:** update dependency node-fetch to v2.7.0 ([26d53e3](https://github.com/gadicc/node-yahoo-finance2/commit/26d53e37001ffec7e8fc756dfd9b39baa303983d))
* **validation:** updated upgradeDowngradeHistory Grades ([#684](https://github.com/gadicc/node-yahoo-finance2/issues/684)) ([fe6de09](https://github.com/gadicc/node-yahoo-finance2/commit/fe6de097ab864e82bfa62be170fe392e10b60135))

# [2.7.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.6.0...v2.7.0) (2023-09-18)


### Bug Fixes

* **chart:** belatedly promote to stable ("chart" vs "_chart") ([28ba479](https://github.com/gadicc/node-yahoo-finance2/commit/28ba479ecb8de02e4faa21ffcd9dc0b446981d04))
* **deps:** update dependency @types/tough-cookie to v4.0.3 ([#673](https://github.com/gadicc/node-yahoo-finance2/issues/673)) ([625acc0](https://github.com/gadicc/node-yahoo-finance2/commit/625acc044e5eb41a010d26c37e2c6ef733f120cf))
* **getCrumb:** rely on cookie expiry time exclusively ([178e122](https://github.com/gadicc/node-yahoo-finance2/commit/178e122a9656b2ca548611a3c95cdfd247802c05))
* **getCrumb:** store crumb in cookie store too ([#670](https://github.com/gadicc/node-yahoo-finance2/issues/670)) ([81031e8](https://github.com/gadicc/node-yahoo-finance2/commit/81031e8510ee36551c353391952148d3485a6a73))
* **getCrumb:** use logger.debug vs console.log ([bb1c06c](https://github.com/gadicc/node-yahoo-finance2/commit/bb1c06c0ea3d7af1f5869f6ec92db8d04b187810))
* **schema:** options / cookieJar ([#670](https://github.com/gadicc/node-yahoo-finance2/issues/670)) ([4d658bf](https://github.com/gadicc/node-yahoo-finance2/commit/4d658bf9eaec8a779a0255451dde991aa0c62510))
* **schema:** options / cookieJar ([#670](https://github.com/gadicc/node-yahoo-finance2/issues/670)) ([f65f69c](https://github.com/gadicc/node-yahoo-finance2/commit/f65f69c30fabad5afd92d549bcbe6660c2755e9e))
* **schema:** skip function types (not in js-schema), related fixes ([b772399](https://github.com/gadicc/node-yahoo-finance2/commit/b7723992a0cb20464d3c29c68b5ac675a62fbcd3))
* **schema:** update (rename _chart to chart) ([fd30770](https://github.com/gadicc/node-yahoo-finance2/commit/fd3077080f45d0eb26abcdd6b3db2b7b25db2a96))


### Features

* **cli:** add guidance to use CLI with submodules ([#626](https://github.com/gadicc/node-yahoo-finance2/issues/626)) ([7d08bb1](https://github.com/gadicc/node-yahoo-finance2/commit/7d08bb10210b9b1a5dd69de72a455e05a59d76aa))
* **cli:** use a file-cookie-store ([#670](https://github.com/gadicc/node-yahoo-finance2/issues/670)) ([e2239b4](https://github.com/gadicc/node-yahoo-finance2/commit/e2239b45e93b171a29d5fd94b0452bcefbeb6d83))
* Customisable logging ([8ed81ae](https://github.com/gadicc/node-yahoo-finance2/commit/8ed81ae10d9d84c5222d25ad54189b448d058130))
* **getCrumb:** ability to specify custom cookie jar / store ([#670](https://github.com/gadicc/node-yahoo-finance2/issues/670)) ([6390a80](https://github.com/gadicc/node-yahoo-finance2/commit/6390a80c8d5330aab414eaa8fd7a8b788893eb4c))
* **getCrumb:** ability to specify custom cookie jar / store ([#670](https://github.com/gadicc/node-yahoo-finance2/issues/670)) ([b298844](https://github.com/gadicc/node-yahoo-finance2/commit/b298844f2fdd848e18473261e4d9cf4666ee5f30))

# [2.6.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.5.0...v2.6.0) (2023-09-15)


### Bug Fixes

* **chart:** belatedly promote to stable ("chart" vs "_chart") ([b1c8c67](https://github.com/gadicc/node-yahoo-finance2/commit/b1c8c67a7a7f83d852844e3ac24a00fa3cb09043))
* **deps:** update dependency @types/tough-cookie to v4.0.3 ([#673](https://github.com/gadicc/node-yahoo-finance2/issues/673)) ([321607c](https://github.com/gadicc/node-yahoo-finance2/commit/321607c6673ec8cbc7cdbb00e9cb3218307fc6f6))
* **schema:** update (rename _chart to chart) ([77a96d2](https://github.com/gadicc/node-yahoo-finance2/commit/77a96d29d17c17e79e3dec81332d2d48317f203a))


### Features

* **cli:** add guidance to use CLI with submodules ([#626](https://github.com/gadicc/node-yahoo-finance2/issues/626)) ([c2c848f](https://github.com/gadicc/node-yahoo-finance2/commit/c2c848f1fe955e8b96232e65d54fa78489d63d63))

# [2.5.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.7...v2.5.0) (2023-09-07)


### Features

* **dailyGainers:** add new dailyGainers module ([#666](https://github.com/gadicc/node-yahoo-finance2/issues/666)) ([5085014](https://github.com/gadicc/node-yahoo-finance2/commit/50850149e3cd5dbd18c4ab23d980ce2863a1d51e))

## [2.4.7](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.6...v2.4.7) (2023-09-06)


### Bug Fixes

* **insights:** Insights and SEC Filings validation errors ([#665](https://github.com/gadicc/node-yahoo-finance2/issues/665)) ([23f2789](https://github.com/gadicc/node-yahoo-finance2/commit/23f27895f0678692ae829b8c8bf3478b7f59b341)), closes [#663](https://github.com/gadicc/node-yahoo-finance2/issues/663) [#664](https://github.com/gadicc/node-yahoo-finance2/issues/664)
* **insights:** missing/optional fields/enums, tests (fixes [#663](https://github.com/gadicc/node-yahoo-finance2/issues/663)) ([3c02753](https://github.com/gadicc/node-yahoo-finance2/commit/3c0275336f9533630a008a9a37ada9a63eb83996))
* **quoteSummary:** add Grade "ConvictionBuy"; tests foR ARMK ([#664](https://github.com/gadicc/node-yahoo-finance2/issues/664)) ([c0efc07](https://github.com/gadicc/node-yahoo-finance2/commit/c0efc074dfbb6d92462a290c4fcc605663eebaba))

## [2.4.6](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.5...v2.4.6) (2023-09-04)


### Bug Fixes

* **chart/validation:** allow null results in some fields ([#662](https://github.com/gadicc/node-yahoo-finance2/issues/662)) ([83233fb](https://github.com/gadicc/node-yahoo-finance2/commit/83233fb5d6792cb84fe02a8c2dce07929bb8ae03))
* **chart/validation:** commit updated schema and http fixture ([#662](https://github.com/gadicc/node-yahoo-finance2/issues/662)) ([e99cb18](https://github.com/gadicc/node-yahoo-finance2/commit/e99cb186284ae36efab54e7ce8228b4128da83fa))

## [2.4.5](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.4...v2.4.5) (2023-09-03)


### Bug Fixes

* **quote:** schema dividend{Rate,Yield}, 52wkChngPercent (fixes [#636](https://github.com/gadicc/node-yahoo-finance2/issues/636)) ([4e6ed20](https://github.com/gadicc/node-yahoo-finance2/commit/4e6ed2051ad62c27417c4e2908b592edcca05a63))

## [2.4.4](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.3...v2.4.4) (2023-08-12)


### Bug Fixes

* **csv2json,historical:** dividends/csv with no data (fixes [#658](https://github.com/gadicc/node-yahoo-finance2/issues/658)) ([13dcc64](https://github.com/gadicc/node-yahoo-finance2/commit/13dcc644ea1d5224ff45ada4171ea201eb716c0b))
* **deps:** update dependency node-fetch to v2.6.12 ([9f2352b](https://github.com/gadicc/node-yahoo-finance2/commit/9f2352bfaf4d3ad8fe42306cc2fc8866d369d248))
* **deps:** update dependency tough-cookie to v4.1.3 ([8ea89d2](https://github.com/gadicc/node-yahoo-finance2/commit/8ea89d230eafda2416ec66037471a75a788656a9))
* **fixDevel:** send real request with full URL with crumb ([e3b2409](https://github.com/gadicc/node-yahoo-finance2/commit/e3b240960c5fb0019fb888bc61f4c761e1c7af97))
* **quoteSummary:** schema: optional {stock,bond}Position (fixes [#639](https://github.com/gadicc/node-yahoo-finance2/issues/639)) ([cc669b8](https://github.com/gadicc/node-yahoo-finance2/commit/cc669b8771ba8ae1a6606379bd853b4047bca070))
* **schema:** quoteSummary, secFilings types (fixes [#646](https://github.com/gadicc/node-yahoo-finance2/issues/646)) ([e92702e](https://github.com/gadicc/node-yahoo-finance2/commit/e92702e03b7b83ad7b4227f5fe14bc7071f0c224))
* **search:** also "Futures" (in addition to "Future") for typeDisp ([d745b67](https://github.com/gadicc/node-yahoo-finance2/commit/d745b67896345fec0a87f4187ffdfc89938082e3))
* **validateAndCoerceTypes:** add a node for #help-fix doc ([662760d](https://github.com/gadicc/node-yahoo-finance2/commit/662760da63d5bc9d1890d7504a3fde330bedc37f))
* **validations:** quoteSummary BMW.DE (fixes [#638](https://github.com/gadicc/node-yahoo-finance2/issues/638)) ([d943e97](https://github.com/gadicc/node-yahoo-finance2/commit/d943e97b8f6b111414c7f1bbbd720bedad342675))

## [2.4.3](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.2...v2.4.3) (2023-07-24)


### Bug Fixes

* **deps:** update dependency node-fetch to v2.6.12 ([adbd93f](https://github.com/gadicc/node-yahoo-finance2/commit/adbd93ffb1a2c1f04523ce5bb523f19c2f836514))
* **deps:** update dependency tough-cookie to v4.1.3 ([aa4d087](https://github.com/gadicc/node-yahoo-finance2/commit/aa4d0874e5a26b47fcbfb0a38d3cd6b5f8654a0c))
* **fixDevel:** send real request with full URL with crumb ([2911f36](https://github.com/gadicc/node-yahoo-finance2/commit/2911f36146bd1b59490f653b6728c85a9f28d79c))
* **quoteSummary:** schema: optional {stock,bond}Position (fixes [#639](https://github.com/gadicc/node-yahoo-finance2/issues/639)) ([cd63b48](https://github.com/gadicc/node-yahoo-finance2/commit/cd63b481f8f4b90c48d1706de6e19d86cecee12c))

## [2.4.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.1...v2.4.2) (2023-07-14)


### Bug Fixes

* **quoteSummary:** "needsCrump" since a few days ago?  fixes [#633](https://github.com/gadicc/node-yahoo-finance2/issues/633). ([d05a764](https://github.com/gadicc/node-yahoo-finance2/commit/d05a764b4456309e2c0ae73c05474481f3fa146d))

## [2.4.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.4.0...v2.4.1) (2023-05-08)


### Bug Fixes

* **getCrumb:** handle consent when required i.e. in EU ([#637](https://github.com/gadicc/node-yahoo-finance2/issues/637)) ([a4f90f1](https://github.com/gadicc/node-yahoo-finance2/commit/a4f90f1b400f772cb851a2e4b38f471ffece2213))

# [2.4.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.10...v2.4.0) (2023-05-08)


### Bug Fixes

* **crumb:** needsCrumb option, and in quote() only ([cf92258](https://github.com/gadicc/node-yahoo-finance2/commit/cf92258b7a28cf9341f254b1e589d93cd3c2c086))
* **crumb:** send accept header; cleanup, type fixes ([c21f025](https://github.com/gadicc/node-yahoo-finance2/commit/c21f02592538aba43eeb371af3d1c4f6e3372c4c))
* **crumb:** use cookie expire time for crumb cache ([c943a65](https://github.com/gadicc/node-yahoo-finance2/commit/c943a65022306d9a058d6f495a31b6bfa23a15e4))
* **deps:** update dependency node-fetch to v2.6.9 ([b85629a](https://github.com/gadicc/node-yahoo-finance2/commit/b85629ac278d75103c9b7816162e40a2afd793db))


### Features

* **crumb:** initial work... cookieJar, getCrumb, use cookies / crumb ([32f3042](https://github.com/gadicc/node-yahoo-finance2/commit/32f3042eaad5815511967edebafcaf20072e4b66))

## [2.3.10](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.9...v2.3.10) (2022-11-16)


### Bug Fixes

* **options:** currency, percentChange optional e.g. PYPL (fixes [#561](https://github.com/gadicc/node-yahoo-finance2/issues/561)) ([3c99145](https://github.com/gadicc/node-yahoo-finance2/commit/3c991456c335f204441f75c18f14a8e1b5ae8e9c))

## [2.3.9](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.8...v2.3.9) (2022-11-16)


### Bug Fixes

* **options,quote:** EBAY "ask", "cryptoTradeable" fields (fixes [#560](https://github.com/gadicc/node-yahoo-finance2/issues/560)) ([b2c4b5a](https://github.com/gadicc/node-yahoo-finance2/commit/b2c4b5a348117b48bcd4378f98c6f6933d1f2c74))

## [2.3.8](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.7...v2.3.8) (2022-11-16)


### Bug Fixes

* **historical:** typescript fix for backwards compatibility ([2533dab](https://github.com/gadicc/node-yahoo-finance2/commit/2533dab067fea7ea99de84a6c4a4b15d9c2ed2e7))
* **historical:** update schema for last commit :`) ([7ddf93c](https://github.com/gadicc/node-yahoo-finance2/commit/7ddf93c1e32fb4d3b2af1036cae47264aca931f0))

## [2.3.7](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.6...v2.3.7) (2022-11-14)


### Bug Fixes

* **historical:** validation for events {dividends,split} (fixes [#557](https://github.com/gadicc/node-yahoo-finance2/issues/557)) ([e83ede6](https://github.com/gadicc/node-yahoo-finance2/commit/e83ede678684a4fb08668cd49113a1e37ef5cbbb))

## [2.3.6](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.5...v2.3.6) (2022-08-13)


### Bug Fixes

* **quoteSummary:** more incomeStatement nulls; THYAO.IS; fixes [#517](https://github.com/gadicc/node-yahoo-finance2/issues/517) ([46cb9eb](https://github.com/gadicc/node-yahoo-finance2/commit/46cb9eb5803ba2c628e7ba34856399bdf7212dd8))

## [2.3.5](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.4...v2.3.5) (2022-08-13)


### Bug Fixes

* **quoteSummary:** null operatingIncome (some .IS stocks; [#517](https://github.com/gadicc/node-yahoo-finance2/issues/517)) ([1b00e06](https://github.com/gadicc/node-yahoo-finance2/commit/1b00e06f3a1e54984515b008587beab8c1273f35))
* **search:** add types for new fields ([714d891](https://github.com/gadicc/node-yahoo-finance2/commit/714d891e021375b2968180f24088db0fc8756e66))

## [2.3.4](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.3...v2.3.4) (2022-06-29)


### Bug Fixes

* **quoteSummary:** 10-QA; pctChange; coinMarketCapLink (fixes [#500](https://github.com/gadicc/node-yahoo-finance2/issues/500)) ([a1119a8](https://github.com/gadicc/node-yahoo-finance2/commit/a1119a854d5672cea174bed9a62c7ab22fff6502))
* **validation:** 3rd hint help text for "bad" symbols (closes [#465](https://github.com/gadicc/node-yahoo-finance2/issues/465)) ([9e84387](https://github.com/gadicc/node-yahoo-finance2/commit/9e84387e453b34a4945e78e4a9df1157468c32ad))
* **validation:** show pkg name and version in help text ([f27b901](https://github.com/gadicc/node-yahoo-finance2/commit/f27b9017fd5643932f4067c5d7b2a641f783a7ea))

## [2.3.3](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.2...v2.3.3) (2022-05-02)


### Bug Fixes

* schema for APS.AX in insights,quoteSummary,recommends ([#461](https://github.com/gadicc/node-yahoo-finance2/issues/461)) ([e0cf583](https://github.com/gadicc/node-yahoo-finance2/commit/e0cf5839bb42a86fc97b9f2954f94c9a63a24621))

## [2.3.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.1...v2.3.2) (2022-04-27)


### Bug Fixes

* **quote,quoteSummary:** support FUTURE type + tests (closes [#449](https://github.com/gadicc/node-yahoo-finance2/issues/449)) ([56b664b](https://github.com/gadicc/node-yahoo-finance2/commit/56b664bd46098f432a46716c6b6b83d29f9537f2))

## [2.3.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.3.0...v2.3.1) (2022-04-13)


### Bug Fixes

* **quote:** make customPriceAlertConfidence optional ([#248](https://github.com/gadicc/node-yahoo-finance2/issues/248),[#445](https://github.com/gadicc/node-yahoo-finance2/issues/445)) ([1863fbf](https://github.com/gadicc/node-yahoo-finance2/commit/1863fbfd5c24608f82c262ad60635d18cb69feda))
* **quote:** optional "openInterest" prop; schema + tests ([#248](https://github.com/gadicc/node-yahoo-finance2/issues/248)) ([d8c7808](https://github.com/gadicc/node-yahoo-finance2/commit/d8c7808e87a9415639bc55e49cbc3bea7975cef1))
* **quote:** optional "typeDisp" prop ([#248](https://github.com/gadicc/node-yahoo-finance2/issues/248)) ([cf7703a](https://github.com/gadicc/node-yahoo-finance2/commit/cf7703add6e919cbb8407103bb4330e160fc831c))

# [2.3.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.2.0...v2.3.0) (2022-03-06)


### Bug Fixes

* **insights:** fix schema for more recent yahoo results ([c71a400](https://github.com/gadicc/node-yahoo-finance2/commit/c71a400588011171839ae15f571518e8fca17549))
* **validation:** Date, allow ISODate without ms precision too ([82ba1cb](https://github.com/gadicc/node-yahoo-finance2/commit/82ba1cbc8ad910a6badfdb77791786fecd44c632))


### Features

* **yahoo:** Configurable YF_QUERY_HOST in URLs ([#109](https://github.com/gadicc/node-yahoo-finance2/issues/109)) ([716c0f1](https://github.com/gadicc/node-yahoo-finance2/commit/716c0f115571c15d76ff5e1e2ef10aab5fbf02e6))

# [2.2.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.9...v2.2.0) (2022-03-03)


### Features

* **validation:** allow additionalProperties (closes [#401](https://github.com/gadicc/node-yahoo-finance2/issues/401)) ([#411](https://github.com/gadicc/node-yahoo-finance2/issues/411)) ([00f4f8e](https://github.com/gadicc/node-yahoo-finance2/commit/00f4f8e5705c7e3c8709ee38b66fe916f987874c))

## [2.1.9](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.8...v2.1.9) (2022-02-27)


### Bug Fixes

* **quoteSummary:** add twitter? to {asset,summary}Profile (fixes [#418](https://github.com/gadicc/node-yahoo-finance2/issues/418)) ([1c7c1cb](https://github.com/gadicc/node-yahoo-finance2/commit/1c7c1cba16a8560577ba70783bd63b1c8b7665b5))

## [2.1.8](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.7...v2.1.8) (2022-02-26)


### Bug Fixes

* **quote:** don't pulle Quote with QuoteNone (fixes [#417](https://github.com/gadicc/node-yahoo-finance2/issues/417)) ([5178c78](https://github.com/gadicc/node-yahoo-finance2/commit/5178c78fc0454851e885ac4442ea63feedcbb1f4))

## [2.1.7](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.6...v2.1.7) (2022-02-26)


### Bug Fixes

* **quote/cryptocurrency:** more optionals; ZRC-USD test (fixes [#403](https://github.com/gadicc/node-yahoo-finance2/issues/403)) ([cffe7a6](https://github.com/gadicc/node-yahoo-finance2/commit/cffe7a6eb90f7c0e3e1715e6d33157217db9e3c2))

## [2.1.6](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.5...v2.1.6) (2022-02-24)


### Bug Fixes

* **quote:** allow a customPriceAlertConfidence property (fixes [#412](https://github.com/gadicc/node-yahoo-finance2/issues/412)) ([84b7cf7](https://github.com/gadicc/node-yahoo-finance2/commit/84b7cf7ef509e4ab2bbcbeba388dbf5bcf0f31b1))
* **quote:** return undefined for quoteType "NONE" (fixes [#381](https://github.com/gadicc/node-yahoo-finance2/issues/381)) ([e067a81](https://github.com/gadicc/node-yahoo-finance2/commit/e067a81d151194cebc8ccaa27eb9015f653e72d9))

## [2.1.5](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.4...v2.1.5) (2022-02-23)


### Bug Fixes

* **autoc:** throw error on use (fixes [#337](https://github.com/gadicc/node-yahoo-finance2/issues/337)) ([99846ed](https://github.com/gadicc/node-yahoo-finance2/commit/99846ed5a6709c94a9cd1a8a4abd9c1d8c58f78f))
* **deps:** bump ajv 8.9.0 -> 8.10.0, reconstruct yarn.lock ([#391](https://github.com/gadicc/node-yahoo-finance2/issues/391)) ([4370b44](https://github.com/gadicc/node-yahoo-finance2/commit/4370b44a580b2e8765d511060f9adbd38dc1c911))
* **historical,chart:** throw if period1===period2 (closes [#407](https://github.com/gadicc/node-yahoo-finance2/issues/407)) ([e120e55](https://github.com/gadicc/node-yahoo-finance2/commit/e120e5524dbcbf0913dde79799158489b6feafc8))
* **moduleExec:** support assertSymbol field (closes [#406](https://github.com/gadicc/node-yahoo-finance2/issues/406)) ([1a05f59](https://github.com/gadicc/node-yahoo-finance2/commit/1a05f598fd47ae281c1d5ce632573ea2bcc0f73f))

## [2.1.4](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.3...v2.1.4) (2022-02-17)


### Bug Fixes

* update SearchResult to include new properties ([f64de37](https://github.com/gadicc/node-yahoo-finance2/commit/f64de372feb78780dc951e26df12858c8de01019))

## [2.1.3](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.2...v2.1.3) (2022-02-16)


### Bug Fixes

* **historical:** fix transform code for String date ([1e4c788](https://github.com/gadicc/node-yahoo-finance2/commit/1e4c78844f7ef4c0266789c6d278a0bc27608bd8))
* **options:** queryOpt `date` now accepts Date/string too (fixes [#287](https://github.com/gadicc/node-yahoo-finance2/issues/287)) ([203b6b8](https://github.com/gadicc/node-yahoo-finance2/commit/203b6b83eb7e3a4704e42796b3b5f2431bf75f18))


### Reverts

* Revert "chore(tests): don't use console.dir in tests" ([0480083](https://github.com/gadicc/node-yahoo-finance2/commit/0480083fb3814ec12595544fdb1275cf0e763a86))
* Revert "chore(tests): more debugging to figure out why tests stuck on CI" ([ba2ed67](https://github.com/gadicc/node-yahoo-finance2/commit/ba2ed67bcb7f70df1eab1d24c1a673824738150c))

## [2.1.2](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.1...v2.1.2) (2022-01-29)


### Bug Fixes

* **pkg:** bump ajv and ajv-formats ([3dac116](https://github.com/gadicc/node-yahoo-finance2/commit/3dac116bd49f28c8880929d38777982eb8c28ca4))

## [2.1.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.1.0...v2.1.1) (2022-01-15)


### Bug Fixes

* **setGlobalConfig:** add to index; minor improvements ([#376](https://github.com/gadicc/node-yahoo-finance2/issues/376)) ([464f26f](https://github.com/gadicc/node-yahoo-finance2/commit/464f26f786f92f7299e22fb358e49cb5754f12b3))

# [2.1.0](https://github.com/gadicc/node-yahoo-finance2/compare/v2.0.1...v2.1.0) (2021-12-21)


### Bug Fixes

* **chart:** more query tests, intervals, edge cases ([#336](https://github.com/gadicc/node-yahoo-finance2/issues/336)) ([6b95d7e](https://github.com/gadicc/node-yahoo-finance2/commit/6b95d7e99e775ef6f304642730f4cec7a7e707fa))
* **package:** have semantic-release recognize version branches ([a89d895](https://github.com/gadicc/node-yahoo-finance2/commit/a89d8951278061657ff63d552c1a1fb4e318977e))
* **quote:** equity: allow underlyingSymbol.  LDN.MI test ([#363](https://github.com/gadicc/node-yahoo-finance2/issues/363)) ([817410b](https://github.com/gadicc/node-yahoo-finance2/commit/817410be01dfff72df91aeb697ed6822e4cd169b))


### Features

* **chart:** { return: "array" } (default) + test fix ([#336](https://github.com/gadicc/node-yahoo-finance2/issues/336)) ([1ac66c3](https://github.com/gadicc/node-yahoo-finance2/commit/1ac66c3e335982b198dbf56bc4e311b1192026bd))
* **chart:** initial release as "_chart" ([#239](https://github.com/gadicc/node-yahoo-finance2/issues/239), [#328](https://github.com/gadicc/node-yahoo-finance2/issues/328), [#334](https://github.com/gadicc/node-yahoo-finance2/issues/334)) ([92b90b1](https://github.com/gadicc/node-yahoo-finance2/commit/92b90b1dee5350ae7144b0b642710baaa88ea694))

## [2.0.1](https://github.com/gadicc/node-yahoo-finance2/compare/v2.0.0...v2.0.1) (2021-11-13)


### Bug Fixes

* **quote:** allow optional pageViewGrowthWeekly (fixes [#326](https://github.com/gadicc/node-yahoo-finance2/issues/326)) ([e425cd5](https://github.com/gadicc/node-yahoo-finance2/commit/e425cd588a9172e982dfc0d862a2cebd17fac62d))

# [2.0.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.6...v2.0.0) (2021-10-27)


### Bug Fixes

* **search:** allow exchDisp? type ([80236e5](https://github.com/gadicc/node-yahoo-finance2/commit/80236e54d3d67518a5aa67d62867358b8bacbd15))
* **validation:** correctly handle null dates + coverage ([#264](https://github.com/gadicc/node-yahoo-finance2/issues/264)) ([68378d5](https://github.com/gadicc/node-yahoo-finance2/commit/68378d5dc4dba2e773fa41c72eee60d07455a891))


### Features

* **validation:** add support for "date|null" type ([#264](https://github.com/gadicc/node-yahoo-finance2/issues/264)) ([52ea8e4](https://github.com/gadicc/node-yahoo-finance2/commit/52ea8e4bdcc4261d012de95b88c659deff5fe1b0))


* feat(quoteSummary)!: unify date format (#264) ([4cf1f62](https://github.com/gadicc/node-yahoo-finance2/commit/4cf1f624d55d92f80db4b36b3afe9414f5eb5a3c)), closes [#264](https://github.com/gadicc/node-yahoo-finance2/issues/264) [#263](https://github.com/gadicc/node-yahoo-finance2/issues/263) [#263](https://github.com/gadicc/node-yahoo-finance2/issues/263)


### BREAKING CHANGES

* use `date` instead of `number` for various fields.
The original use of `number` was unintentional.  This commit fixes that.
Unfortunately the type change is a breaking change.

* docs: add insiderTransaction example
* docs: add insiderHolders example
* docs: add netSharePurchaseActivity example
* docs: add institutionOwnership example
* docs: add cashflowStatementHistoryQuarterly example
* docs: add fundOwnership example
* docs: add incomeStatementHistory example
* docs: add incomeStatementHistoryQuarterly example
* docs: add indexTrend example
* docs: add industryTrend example
* docs: add majorDirectHolders example
* docs: add majorHoldersBreakdown example
* docs: add quoteType example
* docs: add recommendationTrend example
* docs: add sectorTrend example
* docs: add fundPerformance example
* docs: add fundProfile example
* docs: add missing symbols in example request
* docs: correct example response
* docs: correct defaultKeyStatistics example
* docs: align date format

## [1.14.6](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.5...v1.14.6) (2021-10-13)


### Bug Fixes

* **pkg/esm:** target es2020->es2019: workaround old toolchains ([#279](https://github.com/gadicc/node-yahoo-finance2/issues/279)) ([ab63b27](https://github.com/gadicc/node-yahoo-finance2/commit/ab63b2773d622a08cde845abb52ac1e4f521e27c))

## [1.14.5](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.4...v1.14.5) (2021-09-24)


### Bug Fixes

* **quoteSummary:** misc interface fixes (fixes [#295](https://github.com/gadicc/node-yahoo-finance2/issues/295)) ([5657df7](https://github.com/gadicc/node-yahoo-finance2/commit/5657df72005380a4b728d973a45796d5b9fa0781))

## [1.14.4](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.3...v1.14.4) (2021-08-12)


### Bug Fixes

* **quoteSummary:** sellingGeneralAdministrative (fixes [#258](https://github.com/gadicc/node-yahoo-finance2/issues/258)) ([c01fe74](https://github.com/gadicc/node-yahoo-finance2/commit/c01fe74bcbab289ccf693ffe4887303a529bd584))
* **search:** add support for screener fields ([#255](https://github.com/gadicc/node-yahoo-finance2/issues/255)) ([2b23ccb](https://github.com/gadicc/node-yahoo-finance2/commit/2b23ccb05b373ff20c20376a024185a0d2fe8af2))

## [1.14.3](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.2...v1.14.3) (2021-08-08)


### Bug Fixes

* **insights:** support optional "upsell" field (fixes [#253](https://github.com/gadicc/node-yahoo-finance2/issues/253)) ([5b7eadb](https://github.com/gadicc/node-yahoo-finance2/commit/5b7eadb198256bc96c4fd5331351ba3734988eda))

## [1.14.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.1...v1.14.2) (2021-07-28)


### Bug Fixes

* **quote:** add { quoteType: "INDEX" } QuoteIndex iface (fixes [#248](https://github.com/gadicc/node-yahoo-finance2/issues/248)) ([6aa0630](https://github.com/gadicc/node-yahoo-finance2/commit/6aa063098384998234d2131433271e96d758974e))
* **quote:** add missing { quoteType: "OPTION" } to QuoteOption iface ([95e64b1](https://github.com/gadicc/node-yahoo-finance2/commit/95e64b1f1c5020478cb954e4419c0bf8c1a4fb75))

## [1.14.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.14.0...v1.14.1) (2021-07-21)


### Bug Fixes

* **pkg:** output cjs with target es2015 for older nodes ([f61fa46](https://github.com/gadicc/node-yahoo-finance2/commit/f61fa46391aa31ee401de7ed2c9a14e1d0f7ab60))

# [1.14.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.13.1...v1.14.0) (2021-06-19)


### Features

* **quote:** allow quote of specific options ([#213](https://github.com/gadicc/node-yahoo-finance2/issues/213)) ([1348515](https://github.com/gadicc/node-yahoo-finance2/commit/134851538a704cddd1cb938163efb039bb9b4630))

## [1.13.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.13.0...v1.13.1) (2021-06-14)


### Bug Fixes

* **csv2json:** recognize "null" -> null ([d077680](https://github.com/gadicc/node-yahoo-finance2/commit/d077680711ae22fd073e1684930b4605d15bd518))
* **historical:** skip null rows ([e98e51e](https://github.com/gadicc/node-yahoo-finance2/commit/e98e51e47b39e80d5e404849f7193e068e0a49fc))

# [1.13.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.12.1...v1.13.0) (2021-06-06)


### Features

* **errors:** expose in yf.errors; improve docs ([#202](https://github.com/gadicc/node-yahoo-finance2/issues/202)) ([a3a7da6](https://github.com/gadicc/node-yahoo-finance2/commit/a3a7da60b2775063450dc4a2fea5d607df7a4cea))

## [1.12.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.12.0...v1.12.1) (2021-06-03)


### Bug Fixes

* **index:** add erroneously removed historical; alphabeticalize ([#200](https://github.com/gadicc/node-yahoo-finance2/issues/200)) ([f750402](https://github.com/gadicc/node-yahoo-finance2/commit/f75040206bf23ce4446f87066633423424348efc))

# [1.12.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.11.0...v1.12.0) (2021-06-02)


### Bug Fixes

* **quoteSummary:** allow price=null in price,quoteType (fixes [#197](https://github.com/gadicc/node-yahoo-finance2/issues/197)) ([990dd4a](https://github.com/gadicc/node-yahoo-finance2/commit/990dd4a5b93c4e0c4c8ffe49e13e0be920f6828a))


### Features

* **quote:** support { "return": "array"* | "map" | "object" } param ([#151](https://github.com/gadicc/node-yahoo-finance2/issues/151)) ([a2d8796](https://github.com/gadicc/node-yahoo-finance2/commit/a2d87964eed10cd9e043ef22ab5ac0ca85013d4c))

# [1.11.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.10.4...v1.11.0) (2021-06-01)


### Bug Fixes

* **deps:** update dependency ajv to ^8.1.0 ([1769641](https://github.com/gadicc/node-yahoo-finance2/commit/1769641f3a70579586235cb9713fda4fcf9d0322))
* **quoteCombine:** resolve `undefined` for missing symbols ([#150](https://github.com/gadicc/node-yahoo-finance2/issues/150)) ([f8c25e3](https://github.com/gadicc/node-yahoo-finance2/commit/f8c25e39fbd84b19e0b5465c30b32406cab1bc39))
* **testing:** specify jest.js path, not bin ([#170](https://github.com/gadicc/node-yahoo-finance2/issues/170)) ([6772c8e](https://github.com/gadicc/node-yahoo-finance2/commit/6772c8e1873b37aa98c3b347902db97ddaf50889))


### Features

* **options:** accept `date` option ([#186](https://github.com/gadicc/node-yahoo-finance2/issues/186)) ([11b8a72](https://github.com/gadicc/node-yahoo-finance2/commit/11b8a72aad53852ca98352bef46f623b7afcf9da))
* add (friendly) warning when used in the browser ([3c4c5a0](https://github.com/gadicc/node-yahoo-finance2/commit/3c4c5a019fcf7a995da071a713167b1be55ea1ab)), closes [#153](https://github.com/gadicc/node-yahoo-finance2/issues/153)
* add insights module ([#169](https://github.com/gadicc/node-yahoo-finance2/issues/169)) ([4603232](https://github.com/gadicc/node-yahoo-finance2/commit/4603232698e168c8893a275828b860fece748f1f))
* **concurrency:** ability to limit max simultaneous requests ([#76](https://github.com/gadicc/node-yahoo-finance2/issues/76)) ([3424d44](https://github.com/gadicc/node-yahoo-finance2/commit/3424d44655b065df8b91ee9d0bf61c910ab94251))
* **modules:** build (true) esm, (interop) cjs modules; tests/readme ([#144](https://github.com/gadicc/node-yahoo-finance2/issues/144)) ([2182f6c](https://github.com/gadicc/node-yahoo-finance2/commit/2182f6cd162547648b468ba9e3bd4a9e242276f5))
* **setGlobalConfig:** add setGlobalConfig function ([#133](https://github.com/gadicc/node-yahoo-finance2/issues/133)) ([43ebaa4](https://github.com/gadicc/node-yahoo-finance2/commit/43ebaa4fae22813159cd0063d638e24d5f55d9d3))

## [1.10.4](https://github.com/gadicc/node-yahoo-finance2/compare/v1.10.3...v1.10.4) (2021-04-08)


### Bug Fixes

* **validation:** add a few new properties and mark a few properties optional ([65d4486](https://github.com/gadicc/node-yahoo-finance2/commit/65d448639bf8d0f4ec17596d73dc496985791950))

## [1.10.3](https://github.com/gadicc/node-yahoo-finance2/compare/v1.10.2...v1.10.3) (2021-04-03)


### Bug Fixes

* **autoc:** return typescript type AutocResultSet not AutocResult ([#110](https://github.com/gadicc/node-yahoo-finance2/issues/110)) ([b863864](https://github.com/gadicc/node-yahoo-finance2/commit/b8638643ea0f73271167286f0fbfd4deb92580ba))

## [1.10.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.10.1...v1.10.2) (2021-04-03)


### Bug Fixes

* **validation:** add properties to quote module response ([4c6ef24](https://github.com/gadicc/node-yahoo-finance2/commit/4c6ef24b6c0504f2996b4ab12338061209fc7487))
* **validation:** add tests for SIMP and fix validation for them ([96891fd](https://github.com/gadicc/node-yahoo-finance2/commit/96891fd7f15bf3340c6840e6fc0be3cb8db9e2d3))

## [1.10.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.10.0...v1.10.1) (2021-03-29)


### Bug Fixes

* **quote:** {regular,pre}MarketTime is Date (like postMT) ([524fed3](https://github.com/gadicc/node-yahoo-finance2/commit/524fed35755f72a05e3430d6d665f1730648fd31))

# [1.10.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.9.1...v1.10.0) (2021-03-28)


### Features

* **optionsModule:** Add `options` module ([#97](https://github.com/gadicc/node-yahoo-finance2/issues/97)) ([7ba6294](https://github.com/gadicc/node-yahoo-finance2/commit/7ba6294fe708507d28e3cca29162ce3c1992d009))

## [1.9.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.9.0...v1.9.1) (2021-03-26)


### Bug Fixes

* **quote:** allow CURRENCY type ([92bd2e8](https://github.com/gadicc/node-yahoo-finance2/commit/92bd2e89b636c3311bb45373d13266e706740079))
* **quoteCombine:** error handling + full coverage ([c6f0c2b](https://github.com/gadicc/node-yahoo-finance2/commit/c6f0c2b3c4bc87d14f4ae268099d5646674f3b62))

# [1.9.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.8.3...v1.9.0) (2021-03-11)


### Bug Fixes

* **index:** add quoteCombine :) ([aeeef49](https://github.com/gadicc/node-yahoo-finance2/commit/aeeef49196d1c09c26ccac5539cba89040a52a51))


### Features

* **quote:** allow ?fields= argument, see docs. ([b597954](https://github.com/gadicc/node-yahoo-finance2/commit/b5979545df918070f265834137b92e99a192907c))
* **quoteCombine:** debounce and combine multiple quote calls ([95bf404](https://github.com/gadicc/node-yahoo-finance2/commit/95bf404e7bc857980816f65d318c04bdbdec5de2))

## [1.8.3](https://github.com/gadicc/node-yahoo-finance2/compare/v1.8.2...v1.8.3) (2021-03-04)


### Bug Fixes

* **quote:** add cryptocurrency interface ([53044d3](https://github.com/gadicc/node-yahoo-finance2/commit/53044d31ef89f9c49a0a80860951d9a1bab7efa9))
* **quoteSummary:** add cryptocurrency types ([0523d6d](https://github.com/gadicc/node-yahoo-finance2/commit/0523d6db9c6da9044a8637b97c6c7f2a003d0355))

## [1.8.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.8.1...v1.8.2) (2021-02-22)


### Bug Fixes

* **ci:** empty-commit to trigger ci publish after token change ([f678c21](https://github.com/gadicc/node-yahoo-finance2/commit/f678c216c33fec7b8272e88a8b675cf84fe9fbbb))
* **validation:** load process only when defined during validation logging ([#50](https://github.com/gadicc/node-yahoo-finance2/issues/50)) ([2f97923](https://github.com/gadicc/node-yahoo-finance2/commit/2f97923ff13e0c6d2314a9d1c8095891a9296dd7))
* **validation:** more optionality, SQYFuture type, more tests ([4377fdf](https://github.com/gadicc/node-yahoo-finance2/commit/4377fdfda6e214ed0b5bf22d3639c888be4ef6d6))

## [1.8.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.8.0...v1.8.1) (2021-02-19)


### Bug Fixes

* **ci:** empty-commit to trigger ci publish after token change ([947be37](https://github.com/gadicc/node-yahoo-finance2/commit/947be378dcc41ec622ef106ccc5843dc1aacdfe5))

# [1.8.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.7.2...v1.8.0) (2021-02-19)


### Bug Fixes

* **search:** add CURRENCY and CRYPTOCURRENCY types, EUR search test ([5ac971a](https://github.com/gadicc/node-yahoo-finance2/commit/5ac971a13f1c97786b3fcebe7d1cfda79ffe55a9))
* **validation:** make a few quoteSummary properties optional ([fbe9310](https://github.com/gadicc/node-yahoo-finance2/commit/fbe9310e0d9455355c60dc36bdd7a0e3f0d1f5d0))
* **validation:** make a few quoteSummary properties optional ([a6535ee](https://github.com/gadicc/node-yahoo-finance2/commit/a6535ee41e5f82f8a7991c2740b3960cccd4c475))


### Features

* **modules:** add a new module (trendingSymbols) ([4f486f7](https://github.com/gadicc/node-yahoo-finance2/commit/4f486f779ea77ce23f4fe0edd401d3da1c7366ac))

## [1.7.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.7.1...v1.7.2) (2021-02-17)


### Bug Fixes

* **browser:** mv fetchDevel to _env, fixes issues w/ `ng build` ([#50](https://github.com/gadicc/node-yahoo-finance2/issues/50)) ([7528580](https://github.com/gadicc/node-yahoo-finance2/commit/75285807114062ea96ba2c74ddf0df01bee393cd))
* **quote:** add additional properties ([4ab73c1](https://github.com/gadicc/node-yahoo-finance2/commit/4ab73c16a27c0d034a539cb1451e5110f3915fd2))
* **quote:** make certain properties optional ([1881bcb](https://github.com/gadicc/node-yahoo-finance2/commit/1881bcbdde4b4229585a00e2eecdbf317314e335))
* **quote:** more optional properties ([#51](https://github.com/gadicc/node-yahoo-finance2/issues/51)) ([631ed45](https://github.com/gadicc/node-yahoo-finance2/commit/631ed459125cbe2ae2381f16adef2e513f4887e6))
* **quoteSummary:** more optionality, enum types, to fix tests ([#51](https://github.com/gadicc/node-yahoo-finance2/issues/51)) ([bc47bdf](https://github.com/gadicc/node-yahoo-finance2/commit/bc47bdfd781a7f7d4013c01848820ec929ccaeae))
* **types:** more optionality in quoteSummary,search for newer stocks ([b230635](https://github.com/gadicc/node-yahoo-finance2/commit/b230635e15dd3801761dc9211989cbf01c8e98e0))
* **validate:** stricter nulls, number|null type, better errors ([#51](https://github.com/gadicc/node-yahoo-finance2/issues/51)) ([93dafc6](https://github.com/gadicc/node-yahoo-finance2/commit/93dafc63c1a2ee3dbec423513a89376348915ccd))
* QuoteSummary & Search validation ([28f0487](https://github.com/gadicc/node-yahoo-finance2/commit/28f04871a1140d0a337bb777454afdb8467c67fd))

## [1.7.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.7.0...v1.7.1) (2021-02-12)


### Bug Fixes

* **search:** ETF/Fund types, ?shortname, more tests ([#31](https://github.com/gadicc/node-yahoo-finance2/issues/31)) ([28a9b03](https://github.com/gadicc/node-yahoo-finance2/commit/28a9b03ff62c0305ec2b28b8945088050a1ed84c))

# [1.7.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.6.0...v1.7.0) (2021-02-10)


### Bug Fixes

* **index:** uhhhh s/_options/_opts/ like it's called everywhere else ([4492993](https://github.com/gadicc/node-yahoo-finance2/commit/44929939aed693c95b65f2e266014692695ad76d))
* **moduleExec:** pass correct object to validation ([#27](https://github.com/gadicc/node-yahoo-finance2/issues/27)) ([8b0f9c7](https://github.com/gadicc/node-yahoo-finance2/commit/8b0f9c7a109cbcb2a30943ccb43f04653238380c))
* **modules:** change overloading order specificy (fixes [#21](https://github.com/gadicc/node-yahoo-finance2/issues/21)) ([1806e61](https://github.com/gadicc/node-yahoo-finance2/commit/1806e61940f30ceaf53f6af50dbd7230df511759))
* **quote:** extend marketState property ([0c36a60](https://github.com/gadicc/node-yahoo-finance2/commit/0c36a60362e180045b867277d2126800e22d3035))
* **quote:** interface fixes, 10am UTC tests ([#35](https://github.com/gadicc/node-yahoo-finance2/issues/35)) ([1c256c7](https://github.com/gadicc/node-yahoo-finance2/commit/1c256c7d67ca2b4d4728c8044a095e047c118914))


### Features

* new module recommendationsBySymbol ([#28](https://github.com/gadicc/node-yahoo-finance2/issues/28)) ([b467acb](https://github.com/gadicc/node-yahoo-finance2/commit/b467acb9bdca7c12ee23c9949985c6e703e064d1))

# [1.6.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.5.2...v1.6.0) (2021-02-08)


### Features

* **quote:** add quote module ([e0f8d35](https://github.com/gadicc/node-yahoo-finance2/commit/e0f8d35f857826d394c6e3e811fc054e53540533))

## [1.5.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.5.1...v1.5.2) (2021-02-06)


### Bug Fixes

* **modules:** don't log errors when {validateResult:false} ([#16](https://github.com/gadicc/node-yahoo-finance2/issues/16)) ([29f23dc](https://github.com/gadicc/node-yahoo-finance2/commit/29f23dcf64d6b72a7d1d96c6baf8b70ff5f1c5bf))

## [1.5.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.5.0...v1.5.1) (2021-02-06)


### Bug Fixes

* **quoteSummary/iface:** additional fixes for mutual fund types ([#20](https://github.com/gadicc/node-yahoo-finance2/issues/20)) ([4d19692](https://github.com/gadicc/node-yahoo-finance2/commit/4d19692dc80cca136eb97c88602a9f759b692195))
* **quoteSummary/iface:** more optional fields, new Fund types ([#20](https://github.com/gadicc/node-yahoo-finance2/issues/20)) ([15bb4a1](https://github.com/gadicc/node-yahoo-finance2/commit/15bb4a109d96890ce9862bbeccb688689667478c))
* **validate:** init ajv with { allErrors: true } ([9793718](https://github.com/gadicc/node-yahoo-finance2/commit/979371892967d2d61f9533f4fc4f37748b667110))

# [1.5.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.4.2...v1.5.0) (2021-02-05)


### Bug Fixes

* **search:** change longname to be an optional property ([9b8128d](https://github.com/gadicc/node-yahoo-finance2/commit/9b8128d1abc33b1487264826454913f15fc90b3c))
* **validate:** honor _opts: { validation: { logErrors: true }} ([1e0ebae](https://github.com/gadicc/node-yahoo-finance2/commit/1e0ebae2b516e15242ef592c814519e9a75bdf06))
* **validate:** show errors by default ([ab87ad3](https://github.com/gadicc/node-yahoo-finance2/commit/ab87ad30dc4594b256940aebbe074baa8c4c55a8))


### Features

* **modules:** allow { validateResult: false } to not throw ([#16](https://github.com/gadicc/node-yahoo-finance2/issues/16)) ([dc199b5](https://github.com/gadicc/node-yahoo-finance2/commit/dc199b50d46dae26222ccf75bc5efa2c8eff7dcc))

## [1.4.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.4.1...v1.4.2) (2021-02-04)


### Bug Fixes

* **csv2json:** throw on invalid input.  add tests ([9a4d31a](https://github.com/gadicc/node-yahoo-finance2/commit/9a4d31ad7849b485e88b20a73e6436bdd30d67d8))
* **readme:** show correct usage instructions (and update on npm) ([03afec8](https://github.com/gadicc/node-yahoo-finance2/commit/03afec81e617a744186451801d72124ac74e10b8))

## [1.4.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.4.0...v1.4.1) (2021-02-03)


### Bug Fixes

* **quoteSummary:** iface fixes, TopHoldings ([904934a](https://github.com/gadicc/node-yahoo-finance2/commit/904934acfe05c21424daad21da93ab2141214de6))
* **quoteSummary:** more optional props, more tests ([3fa958c](https://github.com/gadicc/node-yahoo-finance2/commit/3fa958c255bb374b71915a063b4f3d783fb39a50))
* **quoteSummary:** remove non-existant "symbol" submodule ([eae40e2](https://github.com/gadicc/node-yahoo-finance2/commit/eae40e2c2a98c7bd17d431474bf70d9da5fdd94b))
* **quoteSummary/assetProfile:** make *Risk fields optional ([08561c7](https://github.com/gadicc/node-yahoo-finance2/commit/08561c749f732757794447a543b6385ba9666f9b))
* **search:** add SearchQuoteYahooOption type ([cf8dbdb](https://github.com/gadicc/node-yahoo-finance2/commit/cf8dbdb5cc86e7567ad89f5443374609d23f356e))
* **search:** restore default query options ([e0169d1](https://github.com/gadicc/node-yahoo-finance2/commit/e0169d138724bf960623dc7491401ffbc2e679be))
* **validate:** edge case, Date object w/ invalid raw field; add tests ([a98d306](https://github.com/gadicc/node-yahoo-finance2/commit/a98d30694dc4a7022cf57d409cd7d5c4b34295a2))
* **validate:** use new ajv.addKeyword syntax ([f00a14e](https://github.com/gadicc/node-yahoo-finance2/commit/f00a14e86145dcd489fe393a60fa63f8d517d72c))

# [1.4.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.3.1...v1.4.0) (2021-02-02)


### Features

* **env:** multiple environments, browser entry point ([e18aa67](https://github.com/gadicc/node-yahoo-finance2/commit/e18aa67278ae613e8c7ecd93aedb5abcaeda2592))

## [1.3.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.3.0...v1.3.1) (2021-02-01)


### Bug Fixes

* **quoteSummary:** rename conflicting typedefs ([f824f88](https://github.com/gadicc/node-yahoo-finance2/commit/f824f886ffc5d507f57f3e2fdd8da4d485f20b7a))

# [1.3.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.2.0...v1.3.0) (2021-02-01)


### Bug Fixes

* **index:** default export ([ae50993](https://github.com/gadicc/node-yahoo-finance2/commit/ae5099310c6685cdce73780c76516f53d92e3740))
* **quoteSummary:** s/EndDate/DateObj, and have DateObj json -> Date ([#7](https://github.com/gadicc/node-yahoo-finance2/issues/7)) ([d5f834f](https://github.com/gadicc/node-yahoo-finance2/commit/d5f834f8c2fe242106416fd167a86d7cab13b9e1))
* **quoteSummary:** schema updates and transform fixes ([0930f33](https://github.com/gadicc/node-yahoo-finance2/commit/0930f3307ab4487a9ec8680eb1a945f7f94afb21))


### Features

* **quoteSummary:** all submodules, using validation type coercion ([3970132](https://github.com/gadicc/node-yahoo-finance2/commit/39701320e4606fe2549138a5f661c57c04b5529e))
* **quoteSummary/assetProfile:** complete ([#7](https://github.com/gadicc/node-yahoo-finance2/issues/7)) ([e95dbc8](https://github.com/gadicc/node-yahoo-finance2/commit/e95dbc8c28b731818b347e570054e0a28fa3ae7e))

# [1.2.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.1.1...v1.2.0) (2021-01-30)


### Bug Fixes

* **errors:** tsc needs static errors ([d2c734e](https://github.com/gadicc/node-yahoo-finance2/commit/d2c734e2aa12929b1d99638850d6cace84d0fb66))
* **fetch:** s/throw new error/throw error/ ([084990d](https://github.com/gadicc/node-yahoo-finance2/commit/084990d447b930ac66d6e6c797ae5032aedf4c71))


### Features

* **modules:** better runtime option checking ([dffa79a](https://github.com/gadicc/node-yahoo-finance2/commit/dffa79abac9493d59067a76d4cfb99ae6293ea68))

## [1.1.1](https://github.com/gadicc/node-yahoo-finance2/compare/v1.1.0...v1.1.1) (2021-01-29)


### Bug Fixes

* **package:** generateSchema -> yarn generateSchema ([896b2cd](https://github.com/gadicc/node-yahoo-finance2/commit/896b2cdbd241580ec17fbe6db8b9c4e011a2ddc0))

# [1.1.0](https://github.com/gadicc/node-yahoo-finance2/compare/v1.0.3...v1.1.0) (2021-01-29)


### Bug Fixes

* **autoc/search:** do typescript arrays properly, nonYahooQuotes ([28a2fd2](https://github.com/gadicc/node-yahoo-finance2/commit/28a2fd290e8a095e0ff5c844a7f10ea3c4512171))
* **fetch:** prefer JSON errors where possible ([2b14f15](https://github.com/gadicc/node-yahoo-finance2/commit/2b14f153a5ba468e8d727a2a3d7a73264c316a40))
* **historical:** add missing 'high', improve types ([91be9dc](https://github.com/gadicc/node-yahoo-finance2/commit/91be9dc8c1dd41ca1839b277c32837fe2ee793e7))
* **index:** revert back to non-class re-export approach ([3954244](https://github.com/gadicc/node-yahoo-finance2/commit/3954244badf775646a590f53070c53142abcbc3e))
* **search:** transform dates ([52b585c](https://github.com/gadicc/node-yahoo-finance2/commit/52b585c50eabb064ac248e57629f7a7f8352e1da))


### Features

* **bin:** use console.dir with colors on tty, JSON otherwise ([6db79e5](https://github.com/gadicc/node-yahoo-finance2/commit/6db79e580e4717374ca4b17bf1e29e10c7436053))
* **historical:** module and supporting csv code ([5b6eac4](https://github.com/gadicc/node-yahoo-finance2/commit/5b6eac4ef5103b12a30041426d2c0ec46f5b8651))
* **quoteSummary:** more work.  package: add dot-prop ([edc1554](https://github.com/gadicc/node-yahoo-finance2/commit/edc1554145af670e1ec7691089f01a66a883cdd7))

## [1.0.3](https://github.com/gadicc/node-yahoo-finance2/compare/v1.0.2...v1.0.3) (2021-01-24)


### Bug Fixes

* **package:** prepublish, typescript defs, exports; mv index; ([8a40888](https://github.com/gadicc/node-yahoo-finance2/commit/8a40888abebb20e792644d88455db46e03355505))

## [1.0.2](https://github.com/gadicc/node-yahoo-finance2/compare/v1.0.1...v1.0.2) (2021-01-24)


### Bug Fixes

* **semantic:** create changelog? ([fb5f6c9](https://github.com/gadicc/node-yahoo-finance2/commit/fb5f6c92207729622606d314876797e1b9082b91))
