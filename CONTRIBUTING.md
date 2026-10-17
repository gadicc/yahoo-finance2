# Contributing

Target pull requests at `dev`. Use exact Bun 1.4.3 and Node 24.21.0 as the
auxiliary tool host, selected locally on PATH:

```sh
bun run check:toolchain
bun install --frozen-lockfile
```

Keep normal lifecycle hooks. The private root `package.json` and `bun.lock` own
root dependencies; the public npm manifest is generated. Workers retain their
separate npm 10.9.9 graph and lock. Deno >=2 remains a consumer target and may
execute only inside the dedicated isolated publisher. See
[development](docs/development.md) for dependency, compiler, editor and API-doc
policies, and [platforms](docs/platforms.md) for runtime qualifications.

## Local verification

```sh
bun run test:serial -- src/modules/quote.test.ts
bun run test:replay
bun run test:full
bun run test:coverage -- --full --run-timeout 300000
bun run typecheck
bun run typecheck:negative
bun run schema:check
bun run format:check
bun run lint
bun run docs:lint
```

Default replay is the maintained library tier, `src/**/*.test.ts` plus top-level
`tests/*.test.ts`. `--full` adds maintained tooling/integration tests; explicit
focused tooling paths remain supported. `--list` prints either selected tier.
Use `bun run test:watch -- PATH` for iteration. Strict replay needs Linux,
Bubblewrap, Python 3, libseccomp and namespaces and fails closed. Direct
`bun test` bypasses the policy. Read [testing](docs/testing.md) for guards,
filter/timeout/coverage semantics and the explicit trusted native option for
Linux/macOS/Windows. [CI](docs/ci.md) owns complete validation and upload policy.

## Fixtures, schemas and documentation

New Yahoo-response tests call `setupCache()` from `tests/common.ts`. Missing
fixtures fail without live fallback. Preserve fixture bytes/modes unless live
capture is explicitly authorized. Do not delete fixtures or set nocache to refresh
ordinary tests. Follow [fixture capture](docs/fixture-capture.md) for separately
authorized brokered capture, HTTP/payload review and required replay baseline.

Keep concrete types and observed literal unions. Model new fields as required
first; optionality needs successful fixture evidence of omission in the same
shape. Distinguish missing values from null, empty objects and arrays. Add factual
JSDoc without guessing semantics. [Schema repair](docs/schema-repair.md) describes
the restricted automatic repair policy and independent docs/types/replay gates.

After interface changes, generate affected schemas from current imported types:

```sh
bun run schema src/modules/quote.ts src/modules/options.ts
bun run test:serial -- src/modules/quote.test.ts src/modules/options.test.ts
```

Plain `bun run schema` regenerates all schemas; include shared-type consumers.
Regenerate before retesting, inspect generated diffs, then run the complete gate.
Never recache as verification. API docs use `bun run docs:gen`, `docs:lint` and
`docs:watch`; `docs:open` explicitly invokes a platform opener. New diagnostics
fail; do not rewrite warning baselines automatically. See
[development](docs/development.md#api-documentation).

## Builds and changes

`bun run build:npm` creates generated `npm/`. Custom output must be a new/empty
external directory with an existing canonical parent. Read
[packaging](docs/packaging.md) for ownership, staging, declaration and real
installed-consumer checks. [Runtime security](docs/runtime-security.md) records
CLI/MCP, cookies, native replay and trusted-tool limits. CLI data commands contact
Yahoo and are not offline verification.

Preserve explicit `.ts` local imports. Use Biome for maintained JS/TS/JSON/JSONC;
Markdown and YAML need manual review. Avoid unsafe fixes, generated output and
unrelated local work. A new module needs concrete interfaces/schema, cached or
synthetic tests, public exports and factual API/README documentation.

Use scoped [Conventional Commits](https://www.conventionalcommits.org/) with
motivation; agents retain the [required footer](AGENTS.md#commit-messages).
Release-tooling changes need `node scripts/check-release-notes.mjs`. Follow
[release guidance](docs/RELEASING.md), [workflow policy](docs/workflow-policy.md)
and the [publisher contract](scripts/publisher/README.md); authentication,
publication, tags and release writes require separate authorization.
A semantic-release dry-run skips prepare and may still check authentication.
The [migration follow-up](docs/bun-migration.md) records current readiness;
archived benchmark timings do not describe the current complete suite.
