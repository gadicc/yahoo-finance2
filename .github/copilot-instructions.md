# Yahoo Finance 2 development instructions

Read [AGENTS](../AGENTS.md) and [CONTRIBUTING](../CONTRIBUTING.md) first.
Development uses exact Bun 1.4.3; ordinary tool versions come from the root
manifest. Consumers
require Node >=22, Bun >=1.4.3 or Deno >=2. Preserve JSR distribution; Deno
execution is permitted only inside the isolated publisher, never ordinary
builds/tests/style checks.

## Setup and commands

Copilot setup selects Bun from `.bun-version`, Node 24.21.0, frozen root
installation with normal hooks and Linux sandbox prerequisites. Verify the
setup instead of assuming timings or bypassing a failure:

```sh
bun run check:toolchain
bun install --frozen-lockfile
bun run test:serial -- src/modules/quote.test.ts
bun run typecheck
bun run typecheck:negative
bun run schema:check
bun run format:check
bun run lint
bun run docs:lint
```

Use `bun run test:replay` for guarded library replay, `bun run test:full` for
the complete library/tooling inventory and `bun run test:watch` for iteration. Strict tests need Linux/Bubblewrap/Python/libseccomp/namespaces and
fail closed. Direct `bun test` bypasses the launcher. Explicit
`bun run test:native` is narrower trusted portable library replay, with a
read-only cache store and fixture-byte detection, without an OS sandbox or
an automatic fallback. See [native scope](../docs/testing.md#explicit-native-replay).

`bun.lock` alone owns root JavaScript resolution. Do not use lock bypass flags,
create another root graph, change global tools or install the independent
Workers harness with Bun. Workers use npm 10.9.9 and Node 24.21.0; follow
[platforms](../docs/platforms.md#cloudflare-workers). Runtime outputs in `npm/`, schemas,
fixtures, coverage and generated docs are not ordinary editable source.

## Interfaces and fixtures

- Preserve local `.ts` imports and concrete public types. Interfaces marked
  `@yf-schema` drive generated schemas; regenerate all affected consumers before
  replay. Explicit schema paths force regeneration; `--force` covers all roots.
- New Yahoo-response tests use `setupCache()` from `tests/common.ts`.
  Replay cache misses fail. Never delete fixtures to refresh them or perform
  live CLI/API lookups as routine verification.
- Live capture needs operator authorization, `FETCH_DEVEL=recache`, explicit
  `--live` and a successful strict baseline. Follow the maintained
  [fixture capture](../docs/fixture-capture.md) policy. No transient errors
  should replace successful fixtures.
- Model new response fields as required first. Optionality needs successful
  omission evidence, including older/static/fake fixtures. Do not widen types
  for HTTP errors, consent or rate limits. Preserve automated repair boundaries
  in [AGENTS](../AGENTS.md#repairing-failures-after-recaching).

Run the relevant offline tests, complete checks, schema gate and docs gate.
Build with `bun run build:npm` when package behavior changes; use an owned/new
outside output as documented. Source CLI help is
`bun bin/yahoo-finance.ts --help`; commands requesting data are live operations.
Do not assert fixed wall-clock timings: full validation includes tooling/kernel
integrations beyond the historical library benchmark.

Use scoped Conventional Commits and the required agent coauthor footer.
Inspect final Git status/diffs and preserve unrelated work. Release workflows,
authentication, publication and GitHub writes require their explicit task scope;
never execute the old Deno development release path.
