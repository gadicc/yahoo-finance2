# yahoo-finance docs

## Table of Contents

1. [Common Options](#common-options)
1. [CLI](./cli.md)
1. [Modules](#modules)
1. [Util Methods](#utils)
1. [Error Handling](#error-handling)
1. [Validation](./validation.md)
1. [Concurrency](./concurrency.md)
1. [Upgrading from v1](./UPGRADING.md)

<a name="common-options"></a>

## Common Options

Coming soon. Briefly:

```js
const queryOpts = {}; // query options specific to the module

const moduleOpts = {
  devel: boolean | string, // see the main README
  fetchOptions: {}, // options to pass to fetch, e.g. { signal }
  validateResult: boolean, // READ SUPER NB VALIDATION DOC BEFORE TURNING THIS OFF
};

const result = await yahooFinance.module(query, queryOpts, moduleOpts);
```

<a name="modules"></a>

## Modules

See the
[list of main modules](https://jsr.io/@gadicc/yahoo-finance2/doc/modules) and
their options in the API docs.

There is also the
[list of "other" modules](https://jsr.io/@gadicc/yahoo-finance2/doc/other) which
are utility modules we provide for convenience but are not a part of the actual
Yahoo Finance API.

<a name="error-handling"></a>

## Error Handling

The modules rely on external services and _things can go wrong_. Therefore, it's
important to wrap your use of this library in try...catch statements, e.g.:

```js
let result;
try {
  result = await yahooFinance.quote(symbol);
} catch (error) {
  // Inspect error and decide what to do; often, you may want to just abort:
  console.warn(
    `Skipping yf.quote("${symbol}"): [${error.name}] ${error.message}`,
  );
  return;
}

doSomethingWith(result); // safe to use in the way you expect
```

So what can go wrong?

- Network errors: request timeouts, no response, etc.
- HTTP errors: internal errors, etc.
- Missing resources, e.g. asking for fund data for a stock.
- Validation errors.
- **Delisted stocks.** If a stock gets delisted, a query that worked previously
  (for a particular symbol) will begin to throw an error. This includes
  historical (and chart) data from _before_ the delisting occured. This is how
  Yahoo treats delisted stocks and there is nothing we can do about it.

The library goes to great lengths to ensure that if there are no errors, the
result you receive will be in an expected format and structure, that is safe to
use, put in your database, perform calculations with, etc (but please do let us
know if you come across any edge cases).

There is a list of specific errors at [lib/errors.ts](../src/lib/errors.ts),
accessible via `yahooFinance.errors`, but many of these will require further
inspection at runtime. For example:

- `FailedYahooValidationError` - see the [Validation](./validation.md) section
  on how to handle these correctly.

- `HTTPError` - the `message` property will be the HTTP Response statusText.

- `Error` - thrown after a "successful" HTTP request that returns JSON with an
  `{ error: { name: "ErrorName", description: "string" } }` shape, and where we
  don't have an "ErrorName" class. The `message` property will be the
  `description`.

Example:

```js
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

let result;
try {
  result = await yahooFinance.quote(symbol);
} catch (error) {
  if (error instanceof yahooFinance.errors.FailedYahooValidationError) {
    // See the validation docs for examples of how to handle this
    // error.result will be a partially validated / coerced result.
  } else if (error instanceof yahooFinance.errors.HTTPError) {
    // Probably you just want to log and skip these
    console.warn(
      `Skipping yf.quote("${symbol}"): [${error.name}] ${error.message}`,
    );
    return;
  } else {
    // Same here
    console.warn(
      `Skipping yf.quote("${symbol}"): [${error.name}] ${error.message}`,
    );
    return;
  }
}

doSomethingWith(result); // safe to use in the way you expect
```

If you run into any problems with error handling, feel free to open an issue so
we can make these docs clearer.

## Validation

As per the previous section, if you do receive a result (i.e. if no error is
thrown), it should reliably be in the format you expect. As such, every received
result is validated against the schema we've developed for each module.

See the [Validation docs](./validation.md) for more info, including how to
continue past validation errors or skip validation entirely, as long as you
understand the risks.

## Concurrency

See [Concurrency Docs](./concurrency.md).

For request timeouts today, pass an `AbortSignal` through `fetchOptions`, either
on the client or per request:

```js
const yahooFinance = new YahooFinance({
  fetchOptions: { signal: AbortSignal.timeout(10_000) },
});

await yahooFinance.quote("AAPL", {}, {
  fetchOptions: { signal: AbortSignal.timeout(10_000) },
});
```

## Upgrading from v1

See [Upgrading from v1](./UPGRADING.md).
