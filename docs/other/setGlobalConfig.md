# setGlobalConfig

This util function sets global config options, merging with the defaults. These
options are then the defaults used for every request. It is the **recommended**
way of setting global config. Setting global config directly is not recommended.

## Usage:

```js
import yahooFinance from "yahoo-finance2";

yahooFinance.setGlobalConfig({
  queue: {
    // some options here
  },
  cookieJar, // see example below
  logger: {/* ... */}, // see example below
});
```

Notes:

- Config provided to this function is validated.
- Options are merged infinite levels deep:

```js
import yahooFinance from "yahoo-finance2";

yahooFinance.setGlobalConfig({
  queue: {
    concurrency: 2,
    // timeout is still set
  },
});
```

## Options

### Cookie Jar

Certain Yahoo APIs require various cookies to run. By default, an in-memory
cookie store is for cookies. This requires zero configuration, however, it means
everytime yahoo-finance2 is reloaded (and that's A LOT on serverless), all the
cookies and consent flow needs to be executed again, which wastes time and
consumes unnecessary resources on Yahoo's side.

Yahoo-finance2 uses [`tough-cookie`](https://www.npmjs.com/package/tough-cookie)
internally, so any compatible cookie store may be used. Here we give an example
of storing cookies on the filesystem (but for serverless / edge, a database
store would be a better fit):

1. Install `tough-cookie-file-store` with npm / yarn / pnpm / bun:

```ts
import os from "os";
import path from "path";
import { FileCookieStore } from "tough-cookie-file-store";
import yahooFinance from "yahoo-finance2";
import { ExtendedCookieJar } from "yahoo-finance2";

const cookiePath = path.join(os.homedir(), ".yf2-cookies.json");
const cookieJar = new ExtendedCookieJar(new FileCookieStore(cookiePath));
yahooFinance.setGlobalConfig({ cookieJar });
```

This is the same code used in the CLI to store cookies in your homedir.

### Logger

By default, `console` is used for logging, but you can replace this with your
own custom logger, extending the default, e.g.:

```ts
yahooFinance.setGlobalConfig({
  logger: {
    info: (...args: any[]) => console.log(...args),
    warn: (...args: any[]) => console.error(...args),
    error: (...args: any[]) => console.error(...args),
    debug: (...args: any[]) => console.log(...args),
  },
});
```

## Options not documented elsewhere

- `YF_QUERY_HOST`

  - Default: `query2.yahoo.finance.com`
  - Description: the host to use to query Yahoo's API. As per
    [this stackoverflow post](https://stackoverflow.com/questions/44030983/yahoo-finance-url-not-working/47505102#47505102):

    - `query1.finance.yahoo.com` serves `HTTP/1.0`
    - `query2.finance.yahoo.com` serves `HTTP/1.1`
    - [Differences between HTTP/1.0 and HTTP/1.1](https://stackoverflow.com/questions/246859/http-1-0-vs-1-1)

  - This option in particular may also be set with an environment variable of
    the same name.
