# Contributing to yahoo-finance2

Interesting in helping out? You're the best! This guide will help you get all
set up with the correct tools and important things to know for the project.

1. [Setup](#setup)
   1. [Cloning](#cloning)
   1. [Required Tools](#tools)
1. [Important Things to Know](#nb)
   1. [Schema generation](#schema)
   1. [Testing](#testing)
   1. [Linting and Formatting](#linting)
   1. [Documentation](#docs)
   1. [Committing Changes](#commits)
1. [Other](#other)

<a name="setup">

## Setup

<a name="cloning"></a>

### Cloning the project

1. Install [git](https://git-scm.com/) if you haven't already.
1. Change to the directory where you want to keep these files.
1. `git clone https://github.com/gadicc/yahoo-finance2.git`
1. `cd yahoo-finance2`

**Default branch: dev**

All PRs should be submitted against the `dev` branch (github default).

<a name="tools"></a>

### Required Tools: Deno & editor plugins

We use the [deno](https://deno.com/) runtime for development. It can be
installed with a single command and replaces node, npm, eslint, prettier, tsc,
jest; is super fast and relieves us of many pain points. The library is still
published in npm and runs on node and other runtimes.

**vscode:** Make sure you have the official
[Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
installed. This includes the language server for super fast typescript, linting,
formatting, etc, and will use the project settings in `.vscode/settings.json`.

<a name="nb"></a>

## Import things to know

<a name="schema"></a>

### Schema Generation

To deliver a type-safe experience, we need to validate all input to ensure it
conforms to what we expect. The single source of truth are the **typescript
interfaces** in each module file. These are compiled into JSON schemas which are
then used for runtime validation.

In VSCode, this is done for you automatically. Otherwise, run `deno task schema`
after changing a file, or `deno task schema --watch` to recompile after file
changes. This only affects `.ts` files that contain a `@yf-schema` keyword. CI
runs `deno task schema:check` and will fail your PR if committed `.schema.json`
files don't match the interfaces — run `deno task schema` before committing
interface changes.

The timestamp check does not track imported type dependencies. Regenerate all
affected files before retrying tests: explicit file arguments force
regeneration, for example
`deno task schema src/modules/quote.ts src/modules/options.ts` after changing
shared quote types. Use `deno task schema --force` to regenerate all schemas
when the dependencies are uncertain. Test consumers of shared schemas too, such
as historical when chart's schema changes.

<a name="testing"></a>

### Testing

`deno task test`

The test task runs with the `test` Deno permission set from `deno.json`, which
limits file access to HTTP fixtures, limits environment access to `FETCH_DEVEL*`
controls, and limits network access to the Yahoo hosts used by the library. Run
focused tests with `deno task test path/to/file.test.ts`. Use
`deno task test:serial path/to/file.test.ts` when debugging or limiting live
Yahoo request concurrency.

NB: HTTP requests are cached to disk. This ensures we can re-run all tests
quickly and consistently across repos (my dev box does 1,252 tests in 793ms). We
use the [fetch-mock-cache](https://www.npmjs.com/package/fetch-mock-cache)
library for this. Make sure the test `describe()` block calls `setupCache()`,
imported from [tests/common.ts](./tests/common.ts), which may also be a useful
read for those interested.

Normal test runs use fetch-mock-cache's `auto` mode: existing fixtures are
replayed, while a cache miss makes a live request and records a new fixture.
This is what creates a fixture when a test is first added or after its existing
fixture is deleted.

Use `deno task test:replay` to verify a cache-only baseline. It sets
fetch-mock-cache's native `FMC_CACHE_MODE=replay`, fails on missing fixtures,
and denies network access and fixture writes. It clears `FETCH_DEVEL`, including
an inherited `recache` setting. Both the local recache runner and the workflow
run this baseline before requesting fresh responses. Normal development tests
retain `auto` mode so new fixtures can still be recorded.

Set the environment variable `FETCH_DEVEL=nocache` to force-run all network
tests without the cache. Set `FETCH_DEVEL=recache` to do the same, but also
rewrite the cache for any failing tests. In both cases, skipped for ids ending
`.static` or `.fake`, which are fixtures we never want to update because they
rely on time-sensitive data or made up data, respectively.

You can also simply delete a fixture file to force its recreation on the next
test run, just make sure not to delete `.static.json` or `.fake.json` files, and
consider if anything actually changed that justifies committing the new file to
the repo.

#### Repairing failures after recaching

Inspect the fixture's HTTP status and payload first. Separate valid response
shape changes from rate limits, consent pages, other HTTP/API errors, changed
assertions, and runtime behavior issues. A delisted symbol returning 404 needs a
decision about test coverage; it is not evidence that successful response fields
are optional.

Use `FETCH_DEVEL=recache deno task test:recache` for live recaching. This runner
first replays the selected tests with network access and fixture writes denied.
If that baseline fails, no live recaching starts. It then processes test files
sequentially. The cache's network fetch wrapper serializes requests across
library instances within each file, including cookie/crumb requests, with at
least three seconds between request starts. Set `FETCH_DEVEL_RECACHE_INTERVAL`
in milliseconds to change the delay. Cached responses remain immediate. A live
HTTP 429 is rejected before writing a fixture and stops the run, even if the
current test catches the error. The workflow also checks the log and changed/new
fixtures before staging, committing, or pushing any fixture changes. Other test
failures continue to capture response drift.

The abort diagnostics include the current test file, endpoint, observation time,
`Retry-After` when supplied, and whether the request supplied a cookie header
and User-Agent. They omit cookie values, crumbs, query strings, and response
bodies. The runner does not automatically retry after a 429. Wait until any
supplied `Retry-After` time has elapsed before considering another run; a new
run does not reset Yahoo's limits.

The runner reports fixture additions, updates, and removals since the live batch
started. Earlier local edits are excluded from this report. It does not roll
back fixtures after an abort: changes from earlier completed tests remain for
review. The local runner never stages, commits, or pushes fixtures. To retain
the complete output and preserve a failing exit status when using Bash:

```bash
set -o pipefail
FETCH_DEVEL=recache deno task test:recache 2>&1 | tee /tmp/yahoo-recache.log
```

Generic getCrumb behavior tests always replay their recorded cookie/crumb
values, including under `FETCH_DEVEL=recache`. Live module tests obtain a fresh
matching cookie/crumb pair using the library's normal request headers. Use the
dedicated country-profile capture command below to intentionally record
authentication flows. The live session is shared within a test process, but not
across the runner's separate test-file processes.

Within each test file, identical successful Yahoo data GET requests reuse the
fresh response in memory. Every test still executes its own assertions and
fixture-write decision, so a later failure can retain a capture even if an
earlier test passed. Matching includes query parameters, headers, live cookies
and crumbs, and fetch options. Cookie/crumb/consent flows, POSTs, HTTP errors,
and responses setting cookies are never reused. Captures do not cross test-file
boundaries. Requests that explicitly disable caching or require refresh are also
fetched separately.

The runner reports network attempts, reused requests, and HTTP/network-error
outcomes by endpoint family in its log and the GitHub job summary, including
when a 429 aborts the run. Symbol paths are grouped, and query strings, cookies,
and payloads are omitted from these counters. Counts are cumulative per file;
only the final snapshot is added to the aggregate.

To run the offline subprocess checks for replay mode, aggregate counters, and
rate-limit termination, use
`deno task test scripts/recache-tests.test.ts --allow-run=deno --allow-write=/tmp`.
These checks are skipped by the normal permission set; they use temporary test
files and synthetic responses rather than live Yahoo requests.

For valid response changes, edit the TypeScript interfaces and regenerate every
affected schema before retrying tests. Keep concrete types and observed literal
unions. Model new fields as required first, and use `?` only when successful
fixtures for the same response shape demonstrate omission. Check existing,
static, and fake fixtures too; distinguish omission from `null`, empty objects,
and empty arrays. Record representative fixture filenames in the change
description. Add JSDoc for new fields when their meaning is clear, without
guessing units or semantics.

Agents repairing recached fixtures should automatically change only interfaces
and generated schemas. If a failure requires runtime code, test expectations, or
fixture changes, report the evidence and proposed action and await operator
feedback for that repair. Continue independent type/schema fixes while waiting,
and check for feedback before finishing. Do not bypass validation to make tests
pass.

Replay focused cached tests, including affected schema consumers, then run the
full suite. Inspect schema diffs and final Git status. Do not recache again as
part of verifying a type/schema fix.

#### Country-specific getCrumb fixtures

Yahoo's cookie, consent, and crumb flow can vary by request geography. We keep
country-specific captures as dated, append-only fixture profiles so one VPN
capture never overwrites another flow. The country code records where the
response was observed; tests assert the captured redirect/request sequence, not
that Yahoo always serves that sequence to everyone in that country.

Connect a VPN, independently verify its exit country, and then run:

```bash
deno task fixtures:capture:getcrumb --country GB
```

The command records a new profile such as `gb-20260808`, compacts response data
that getCrumb never consumes, and immediately replays the compacted fixtures. It
refuses to overwrite an existing profile; use `--profile` with a dated suffix
when two distinct flows are observed on the same day.

Before committing, inspect every generated fixture. Do not keep rate limits,
timeouts, upstream 5xx responses, unrelated interstitials, redirects outside the
expected Yahoo hosts, or authenticated/user-specific cookies. Copy the profile
entry printed by the command into `COMMITTED_PROFILES` in
`src/lib/getCrumb.geo.test.ts`, then disconnect the VPN and run:

```bash
deno task test:serial src/lib/getCrumb.geo.test.ts
```

Committed geographic profiles always replay from cache, even under the generic
`FETCH_DEVEL=recache` workflow. If a new country's normalized request sequence
and relevant cookie/header shape are identical to an existing profile, do not
commit duplicate fixtures solely to add another country label.

Cloudflare Workers coverage lives in `tests/cloudflare` and tests the generated
npm package inside Workers Vitest. Run `deno task test:cloudflare` after changes
that affect npm output or runtime detection. If you change the Cloudflare
harness dependencies or need to regenerate its lockfile, use
`deno task lock:cloudflare`; it pins lockfile generation to the npm behavior CI
expects.

<a name="linting"></a>

### Linting, formatting

Done automatically for you in VSCode with the official Deno extension. If you
use a different editor, see if it also has a Deno extension, otherwise, please
run `deno lint` and `deno fmt` before submitting pull requests.

<a name="docs"></a>

### Documentation

We have two kinds of docs. The [explainer docs](./docs/) and
[API docs](https://jsr.io/@gadicc/yahoo-finance2/doc). The latter are generated
automatically on publish. However, you can build them locally too if you want to
check their appearance before commit. `deno task docs:gen` will build the docs
to a directory called `jsdocs`; `deno task docs:watch` will rebuild the docs on
file changes (just make sure to reload the commmand if you change the deno.json
`exports`), and `deno task docs:open` will open your browser to the docs on
POSIX compliant systems.

<a name="commits"></a>

### Commiting Changes

**Commit Messages**

Commit messages should follow the
[conventionalcommits](https://www.conventionalcommits.org/) standard (basically
Angular). This is important as we use
[semantic-release](https://github.com/semantic-release/semantic-release) to
automate [release](https://github.com/gadicc/yahoo-finance2/releases) (with
their release notes) when we merge back to release branches like `main`, `2.x`,
`next`, `next-major`, etc. Tags like `fix`, `feat`, `BREAKING CHANGE` affect the
resulting semver version and release channel.

<a name="other"></a>

### Other

Let us know if anything here could have been explained better.

### Adding a new module

Checklist:

1. **Create the module file**: Create `src/modules/myModule.ts`. Make sure to
   mark exported interfaces for schema generation with a `// @yf-schema`
   comment.
2. **Generate schemas**: Run `deno task schema` to generate the matching
   `myModule.schema.json`.
3. **Write tests**: Test the module under `src/modules/myModule.test.ts`. Use
   `setupCache()` from `tests/common.ts` if it touches Yahoo HTTP responses. New
   HTTP cache fixtures will be recorded under `tests/fixtures/http`.
4. **Wire the exports**:
   - Export your module in `src/modules/index.ts`.
   - Add a key/value mapping under `exports` in `deno.json`.
5. **Document & Link**: Add JSDoc comments to the module exports (which will
   render on JSR) and add it to the "Available modules" list in the main
   `README.md`.
