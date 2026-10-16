# Agent Notes

This file applies to the whole repository. Read [CONTRIBUTING.md](./CONTRIBUTING.md)
for contributor setup and [the migration tracker](./tests/migration/REPORT.md)
for exact acceptance evidence and outstanding work.

## Project Context

- Development uses exact Bun 1.4.3, TypeScript 6.0.3 and Biome 2.5.15.
- Consumers require Node >=22, Bun >=1.4.3 or Deno >=2. Retain JSR distribution.
- Source lives under `src/`, with colocated tests and `tests/fixtures/http`.
- `npm/` is generated output; edit source and build only when needed.
- Target the default development branch, `dev`.

## Bun migration branch

On `codex/bun-migration`, use
[tests/migration/REPORT.md](./tests/migration/REPORT.md) as the staged migration
tracker and source of acceptance counts, evidence, dependencies and next steps.
Keep original benchmark receipts historical and update acceptance metadata
only after the required reviews. Use GPT-6.1 Sol High for orchestration, planning
and
substantive implementation; Medium (or appropriate Terra/Luna) for bounded
mechanical work; xhigh implementation only for unusually difficult debugging,
tangled architecture or when High is demonstrably struggling. As an explicit
review exception, obtain independent GPT-6.1 Sol xhigh review for each
meaningful step and GPT-6 Astra xhigh adversarial review for important
milestones/final readiness, seeking hidden defects, missed requirements, edge
cases, regressions, security issues and test gaps. Resolve findings and commit
meaningful isolated steps using the commit policy below. Do not change global
model settings or schedule future work as part of this branch policy.

The branch retains JSR publication and Deno >=2 consumers. Do not invoke a Deno
binary for development, tests, builds, formatting or linting. A Deno binary may
be used only by the isolated publishing step. Unported development tools must
be migrated before use.

## Commands

Select Bun 1.4.3 on PATH, run `bun run check:toolchain`, then
`bun install --frozen-lockfile` with normal lifecycle scripts. `bun.lock` alone
owns root JavaScript dependencies. The private root manifest is not the public
npm manifest. `tests/cloudflare/package-lock.json` belongs to the independent
npm 10.9.9 Workers graph; never install it with Bun.

- Full strict replay: `bun run test:replay`.
- Focused replay: `bun run test:serial -- src/modules/quote.test.ts`.
- Watch or coverage: `bun run test:watch`, `bun run test:coverage`.
- Trusted portable library replay: `bun run test:native`, optionally with a path,
  `--serial`, `--watch` or `--coverage`.
- Types: `bun run typecheck`, `bun run typecheck:negative`; use
  `bun run typecheck:incremental` for local iteration.
- Schemas: `bun run schema`, `bun run schema:check` (no-write stale gate).
- Style: `bun run format`, `bun run format:check`, `bun run lint`.
- API docs: `bun run docs:gen`, `bun run docs:lint`, `bun run docs:watch`;
  `bun run docs:open` is an explicit platform opener.
- npm output: `bun run build:npm`; optional `--out-dir` selects a new/empty
  external output with an existing canonical parent. Only default `npm/` may
  replace recognized nonempty output carrying the builder's ownership marker.
- CLI help only: `bun bin/yahoo-finance.ts --help`; data commands make live
  requests and are not offline verification.

Strict tests need Linux, Bubblewrap, Python 3, libseccomp and namespace support.
They fail closed, clear capture controls, deny network and mount fixtures
read-only for descendants. Direct `bun test` bypasses this policy. Explicit
native replay provides a narrower trusted library/portable-tooling inventory,
a read-only FMC store and fixture-byte checks, without an OS sandbox. It never
retries a failed strict run automatically. Read [the trust boundaries](./tests/migration/TRUST-BOUNDARIES.md),
[TESTING](./tests/migration/TESTING.md)
and [NATIVE-REPLAY](./tests/migration/NATIVE-REPLAY.md) before selecting a mode.

## Testing And Fixtures

Tests use `setupCache()` from `tests/common.ts` and `fetch-mock-cache` replay.
A cache miss fails; deleting a fixture or setting `FETCH_DEVEL` does not enable
ordinary live capture. Do not delete fixtures to refresh tests.

Live capture needs operator authorization, `FETCH_DEVEL=recache` and explicit
`--live`, after a successful strict replay baseline. Follow
[RECACHE](./tests/migration/RECACHE.md) and
[COUNTRY-CAPTURE](./tests/migration/COUNTRY-CAPTURE.md). Generic recache protects
static/fake/geographic profiles; country captures are append-only. Inspect
HTTP status/payload before retaining any capture. Never replace successful
fixtures with 429, consent, timeout or upstream 5xx responses. Verification
must not recache. Preserve fixture bytes and modes unless capture is authorized.

## Schema And Validation

- TypeScript interfaces in module files are the source of truth for runtime
  validation schemas.
- If a module file has `@yf-schema`, keep the generated `.schema.json` file in
  sync with `bun run schema`.
- Prefer updating typed interfaces and validation schemas together with focused
  tests that cover the Yahoo response shape involved.
- When Yahoo adds a response field, model it as required first. Make it optional
  only when other cached valid responses demonstrate that the field is absent,
  and add descriptive JSDoc when its meaning is clear. Do not guess semantics.

### Repairing failures after recaching

- Inspect failures and fixture HTTP status/payload before editing interfaces.
  Separate response-shape drift from HTTP/API errors, changed assertions, and
  runtime behavior issues. Do not loosen types to accommodate an error response.
- Keep types tight: use concrete types and observed literal unions. Add `?` only
  with successful fixture evidence of omission in the same response shape;
  distinguish omission from `null`, empty objects, and empty arrays. Check
  older, static, and fake fixtures as well as the newly recached fixtures, and
  record representative filenames in the change description.
- Edit TypeScript interfaces, then regenerate every affected schema **before**
  retrying tests. The generator's timestamp check does not track imported type
  dependencies. Explicit file arguments force regeneration, e.g.
  `bun run schema src/modules/quote.ts src/modules/options.ts`; alternatively
  run `bun run schema --force` to regenerate all schemas. Also test consumers
  of shared schemas, such as historical after chart changes.
- Automated fixture repair is limited to interfaces, additions of observed
  strings to existing nongeneric string-literal-union aliases, and generated
  schemas. Alias edits must preserve names, modifiers, all existing literals in
  order (including duplicates), and add only distinct new plain string literals.
  Other alias edits require manual review. If a failure needs runtime code, test
  expectations, or fixture changes, stop that particular repair, report the
  evidence and proposed action to the operator, and await feedback. Continue
  independent type/schema fixes while waiting and check for feedback before
  finishing. Do not disable validation or broaden a type simply to make a test
  pass.
- Replay focused cached tests first, then the full suite. Inspect generated
  schema diffs and final Git status; do not recache again as part of
  verification.

## Editing Guidelines

- Preserve `.ts` extensions for local imports and the retained consumer runtime
  contracts.
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
  if not sure. For Codex, ~/.codex/config.toml has top level `model` and
  `model_reasoning_effort`.
