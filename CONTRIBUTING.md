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

Set the environment variable `FETCH_DEVEL=nocache` to force-run all network
tests without the cache. Set `FETCH_DEVEL=recache` to do the same, but also
rewrite the cache for any failing tests. In both cases, skipped for ids ending
`.static` or `.fake`, which are fixtures we never want to update because they
rely on time-sensitive data or made up data, respectively.

You can also simply delete a test file to force its recreation on the next test
run, just make sure not to delete `.static.json` or `.fake.json` files, and
consider if anything actually changed that justifies committing the new file to
the repo.

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
