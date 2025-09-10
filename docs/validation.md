# Validation

`yahoo-finance2` validates all results returned from Yahoo before returning
them. This document explains why this is important, but also how you can
side-step this if you understand the risks.

1. [Why Validate](#why-validate)
1. [Using Unvalidated Data](#using-unvalidated-data)
1. [Skip Validation Completely](#using-unvalidated-data)
1. [Don't Log Validation Failures](#dont-log-validation-fails)
1. [A Note on Additional Properties](#note-additional-props)
1. [Help Fix Validation Errors](#help-fix)

<a name="why-validate"></a>

## Why Validate

Validation ensures that your code receives expected input and will not crash
unexpectedly in the future with unexpected results.

Say I have some typical code like:

```js
function calculateStockHoldingValue(symbol) {
  const { qty } = await db.holdings.findOne({ symbol });
  const { price } = await yahooFinance.quoteSummary(symbol, {
    modules: "price",
  });

  return qty * price.regularMarketPrice;
}
```

Say `qty = 50` and unexpectedly, `price.regularMarketPrice` is undefined.

`const result = 50 * undefined; // NaN`

In the best case scenario, this will crash my app somewhere else. In the worst
case scenario, the NaN will be used with other calculations, which will also be
NaNs, which could then crash all other unrelated parts of my app.

Or with dates:

```js
const { price: { regularMarketTime } } = await yahooFinance.quoteSummary(
  "AAPL",
);

// Uncaught TypeError: Cannot read property 'getTime' of undefined
regularMarketTime.getTime(); //  "But it worked fine in development!!"

// Even worse is it IS defined, but is not a Date.  That *won't* throw an error in my code,
// instead, I'll be making a comparison that will be true when it should be false, etc.
const goodTimeToTrade = regularMarketTime > anotherDateObject;
```

By catching errors you can keep your code safe from unexpected input:

```js
let result;
try {
  result = await yahooFinance.search("gold");
} catch (e) {
  // i.e. do nothing with invalid result
  return;
}
// Everything below here will be safe and won't throw unexpected errors
$("input").value(result.Result[0].name);
```

<a name="using-unvalidated-data"></a>

## Using Unvalidated Data

You can decide to catch the error and continue regardless.

```js
let result;
try {
  result = await yahooFinance.search("gold");
} catch (error) {
  // i'll take responsibility for this
  result = error.result;
}
// and will do my own validation
if (
  result &&
  isArray(result.Result) &&
  result.Result[0] &&
  typeof result.Result[0].name === "string"
) {
  $("input").value(result.Result[0].name);
}
```

You also have access to `error.errors` which is an array of schema validation
errors. You could decide that some errors are ok to ignore but others not.

**TypeScript note**: By default you get an interface back, but if validation
fails, obviously we can't guarantee the shape anymore. Consequently, the return
result will be of type `unknown` so TypeScript will still ensure that your code
is safe safe, e.g.

```js
let result;
try {
  result = await yahooFinance.search("gold"); // result is a SearchResult
} catch (error) {
  result = error.result; // result is an unknown
}
```

<a name="using-unvalidated-data"></a>

## Skip Validation Completely

Following on from the above, if you really don't care for validation, you can
use the `{ validateResult: false }` module option to prevent throwing errors
altogether on results that don't pass validation.

```js
const result = await yahooFinance.search("gold", {}, { validateResult: false });

if (
  result &&
  isArray(result.Result) &&
  result.Result[0] &&
  typeof result.Result[0].name === "string"
) {
  $("input").value(result.Result[0].name);
}
```

**TypeScript note**: Following on from the the previous section, with
`{ validateResult: false }` we can no longer guarantee the shape of the return
result, so it will be of type `unknown`:

![validation typescript example](./img/validation-typescript.gif)

### You can also turn off validation for OPTIONS

By default, we only allow sending options to Yahoo that we know about and know
how it will affect the result. However, maybe you discovered something new about
Yahoo's API that you want to experiment with. In that case, you can turn off
options validation. We'll send everything you give us directly to Yahoo, and
Yahoo will perform their own validation on what you sent.

```ts
const quote = await yahooFinance.quote("AAPL", undefined, {
  validateOptions: false,
});
```

<a name="dont-log-validation-fails"></a>

## Don't Log Validation Failures

To turn off the helpful but verbose error logging on validation fails, simply
set:

```js
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance{ validation: { logErrors: false } });
```

<a name="note-additional-props"></a>

## A Note on "Additional Properties"

_Since v2.2 (March 2022)_

We now allow "additional properties" on results received from Yahoo.

This means that while we can still guarantee the type of all known fields we
receive back, we'll no longer throw a new error on new unknown keys.

This is important because Yahoo constantly add new fields, and this would break
all existing deployments.

You can revert to the old behaviour with:

```js
const yahooFinance = new YahooFinance({
  validation: { allowAdditionalProps: false },
});
```

which is the default when running tests. This means that during our development
of the library itself, we make sure that we're testing against all returned
types.

<a name="help-fix"></a>

## Help Fix Validation Errors

1. Fork the repo, clone locally and setup dev environment. See
   [CONTRIBUTING](../CONTRIBUTING.md).

1. Add the problematic symbol, depending on whether it affects just one or
   multiple modules, either to the appropriate `.test.ts` file for that module,
   or to
   [tests/testSymbols.ts](https://github.com/gadicc/node-yahoo-finance2/blob/devel/tests/testSymbols.ts)
   for symbols tested with all modules.

1. Run `deno task test` or `yarn task test <moduleName>`, as relevant. The API
   call will be made and cached locally. The test will fail as expected.

1. **Inspect the error and update the typescript interface in the relevant
   module(s).**

For example, say we had this error:

`The following result did not validate with schema: #/definitions/QuoteSummaryResult`

```js
[
  {
    instancePath: "/topHoldings",
    schemaPath: "#/required",
    keyword: "required",
    params: { missingProperty: "stockPosition" },
    message: "must have required property 'stockPosition'",
    data: {
      maxAge: 1,
      holdings: [],
      equityHoldings: {
        priceToEarnings: 0,
        priceToBook: 0,
        priceToSales: 0,
        priceToCashflow: 0,
      },
      bondHoldings: {},
      bondRatings: [],
      sectorWeightings: [],
    },
  },
];
```

We can see that:

a) The module is **quoteSummary** (from `#/definitions/QuoteSummaryResult`)

b) The error occured in `topHoldings`

c) The issue is that it `"must have required property 'stockPosition'"` but
didn't (you can see the exact response in `data`)

So, we can fix this by making `stockPosition` optional by adding a `?` to its
interface entry. Modify `src/modules/quoteSummary-iface.ts`:

```diff
export interface TopHoldings {
  [key: string]: any;
  maxAge: number;
-  stockPosition: number;
+  stockPosition?: number;
  holdings: TopHoldingsHolding[];
  equityHoldings: TopHoldingsEquityHoldings;
  bondHoldings: object;
```

Now let's test our fix.

1. Run `deno task schema` to rebuild the schema (done for you automatically if
   your'e using vscode)

1. Re-run `deno task test` and make sure the test now passes.

1. (If noticed the issue for multiple symbols, you can test the rest of the
   symbols more quickly via the CLI, with `deno task cli <module> <symbol>`.)

1. Commit changes, e.g.

   `git commit -am "fix(moduleName): make stockPosition optional (fixes #656)`

1. `git push`

1. Go back to GitHub and GitHub will suggest to open a pull request.
