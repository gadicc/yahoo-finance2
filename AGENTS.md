# Agent Notes

This file applies to the whole repository. For fuller contributor guidance, read
[CONTRIBUTING.md](./CONTRIBUTING.md); this file repeats the essentials agents
are most likely to need during edits.

## Project Context

- This is a Deno-first TypeScript library that is published to npm via generated
  output.
- Source code lives under `src/`. Tests usually sit beside the module they cover
  and use fixtures from `tests/fixtures/http`.
- The `npm/` directory is generated package output. Prefer editing source files
  under `src/` and regenerate npm output only when the task explicitly calls for
  it.
- The default development branch is `dev`.

## Commands

- Run the full test suite with `deno task test`.
- Run a targeted test with `deno test -A path/to/file.test.ts`.
- Run schema generation with `deno task schema` after changing exported
  interfaces marked with `@yf-schema`.
- Use `deno fmt` and `deno lint` for formatting and linting.
- Build npm output with `deno task build:npm` when generated npm artifacts are
  required.

## Testing And Fixtures

- Tests use `fetch-mock-cache` and cached HTTP fixtures for repeatability.
- New module tests should call `setupCache()` from `tests/common.ts` when they
  touch Yahoo HTTP responses.
- `FETCH_DEVEL=nocache` forces live network tests without cache.
- `FETCH_DEVEL=recache` updates cache for failing tests. Be careful with fixture
  churn, and do not recache files ending in `.static.json` or `.fake.json`.

## Schema And Validation

- TypeScript interfaces in module files are the source of truth for runtime
  validation schemas.
- If a module file has `@yf-schema`, keep the generated `.schema.json` file in
  sync with `deno task schema`.
- Prefer updating typed interfaces and validation schemas together with focused
  tests that cover the Yahoo response shape involved.

## Editing Guidelines

- Preserve existing Deno import style, including `.ts` extensions for local
  imports.
- Avoid editing generated directories, dependency directories, coverage output,
  or docs output unless the task explicitly requires it.
- Check `git status` before and after changes, and do not overwrite unrelated
  local work.

## Commit Messages

- Use Conventional Commits with scope, e.g. "fix(quote):". This is important for
  `semantic-release` to publish correct versions.
- The commit body should include a concise summary of motivation and changes.
- Always end with: Co-authored-by: <Assistant> (<model>, reasoning: <high>)
  <<email>> `email` part may be ommitted. The rest is best effort, ask the user
  if not sure.
