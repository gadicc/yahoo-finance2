# Contributing to yahoo-finance2

Target pull requests at `dev`. Development uses Bun 1.4.3, TypeScript 6.0.3
and Biome 2.5.15. Consumers require Node >=22, Bun >=1.4.3 or Deno >=2;
JSR distribution remains supported. A Deno binary is permitted only inside the
isolated publisher, including its explicit nonpublishing consumer rehearsal.
Do not use Deno for ordinary development, tests, builds, formatting or linting.

## Bun migration branch bootstrap

Clone the repository and select the exact [Bun 1.4.3 binary](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.3)
for your platform. Put its directory first on PATH without replacing unrelated
global tools. CI uses Node 24.21.0 as the auxiliary tool host. Then run:

```sh
bun --version # 1.4.3
bun run check:toolchain
bun install --frozen-lockfile
```

`.bun-version` and `packageManager` must agree. The explicit toolchain check
runs before resolution; the same check is a normal preinstall hook. A frozen
install alone does not reject a missing lockfile. Do not skip lifecycle scripts,
bypass the guard or use a floating/latest/canary runtime. Inspect
`bun pm untrusted` when changing dependencies; review any needed lifecycle
trust individually rather than replacing Bun's default trust policy blindly.

`bun.lock` is the sole root JavaScript lockfile. The root `package.json` is
private, with exact runtime/tool pins; it is not the published manifest.
`deno.json` retains source identity/version, all 28 public export keys and a
small production import map used by the npm builder. It has no development
tasks or permissions. The isolated publisher derives its own exact production
map from the root Bun graph and owns a private generated resolution lock.
There is no root Deno lock or competing root npm/Yarn/pnpm graph.
`tests/cloudflare/package-lock.json` remains independent and npm-managed.

Bun upgrades, including patches, require review: update both exact tool pins,
inspect release notes and lock changes, check clean frozen normal-hook install
and drift rejection, then run replay, types/negative controls and platform gates
with unchanged fixtures. A runtime minimum change is a separate compatibility
decision. Keep the conventional-commits preset below v10 until its writer
compatibility contract is deliberately updated and release-note checks pass.
See [dependency ownership](tests/migration/DEPENDENCIES.md).

## Tests and fast iteration

The strict launcher requires Linux, Bubblewrap (`bwrap`), Python 3,
`libseccomp.so.2` and user/mount/network/PID namespace support. CI also uses
iproute2 and util-linux for dedicated Workers controls. Missing prerequisites
fail closed; no automatic unguarded retry exists.

```sh
bun run test:focused
bun run test:serial -- src/modules/quote.test.ts
bun run test -- --filter quote --name 'validates|symbol'
bun run test:watch -- src/modules/quote.test.ts
bun run test:replay
bun run test:coverage
```

Strict replay clears inherited capture settings and denies network and fixture
writes for descendants. A missing fixture fails. Direct `bun test` bypasses
launcher enforcement. Start with focused tests for iteration; full validation
also includes compiler, package, subprocess and kernel controls, with isolated
workers. Its timing is not comparable to the original 1,319-library-test/43-file
benchmark. Original experiment drivers and results require their historical
checkout/graph and remain historical; see [REPORT](tests/migration/REPORT.md).

For trusted library work on macOS/Windows or Linux, explicitly select:

```sh
bun run test:native -- src/modules/quote.test.ts
bun run test:native -- --serial
```

Native mode forces replay, uses a store incapable of cache writes and checks
fixture bytes. It has a disclosed narrower inventory and no kernel network or
filesystem sandbox for arbitrary test code. Out-of-scope explicit paths fail.
Use [NATIVE-REPLAY](tests/migration/NATIVE-REPLAY.md) and
[TESTING](tests/migration/TESTING.md) for filters, coverage, omissions, signals
and timeouts; [NATIVE-PLATFORMS](tests/migration/NATIVE-PLATFORMS.md) records
actual OS evidence and remaining platform limits.

## Types, schemas and style

```sh
bun run typecheck
bun run typecheck:negative
bun run schema:check
bun run format:check
bun run lint
bun run docs:lint
```

The maintained checker uses pinned TypeScript 6.0.3 with separate library/tools
projects. `bun run typecheck:incremental` is a local iteration command; no Deno,
experiment Node selector or alternative Bun checker is required. See
[TYPECHECKING](tests/migration/TYPECHECKING.md).

Interfaces marked `@yf-schema` are the source of truth for runtime schemas.
Run `bun run schema` after changes. Explicit files force regeneration, including
imported-type consumers; use `bun run schema --force` when uncertain:

```sh
bun run schema src/modules/quote.ts src/modules/options.ts
bun run test:serial -- src/modules/quote.test.ts src/modules/options.test.ts
```

Keep generated schemas with the corresponding interfaces. `schema:check` is a
no-write stale gate. `bun run schema --watch` is available. VSCode's `schema watch`
task is configured with `runOn: folderOpen`. See
[SCHEMAS](tests/migration/SCHEMAS.md).

`bun run format` changes layout in maintained JS/TS/JSON/JSONC. `bun run lint`
checks recommended Biome rules without fixing; errors fail and warnings remain
visible. Never apply unsafe fixes unattended. Markdown and YAML use manual
review and `.editorconfig`; Biome does not format them. Use VSCode's built-in
TypeScript extension with the workspace TS version and recommended Biome
extension. Workspace Deno is disabled; retain local `.ts` import extensions.
See [BIOME](tests/migration/BIOME.md) for scope and editor behavior.

## Testing and fixtures

New Yahoo-response tests call `setupCache()` from `tests/common.ts`. Existing
fixtures make replay repeatable; ordinary tests never create missing fixtures.
Do not delete fixtures or use `FETCH_DEVEL=nocache` as a development shortcut.

### Repairing failures after recaching

Live capture is separate authorized work. Read [RECACHE](tests/migration/RECACHE.md)
and [COUNTRY-CAPTURE](tests/migration/COUNTRY-CAPTURE.md), inspect safe help with
`bun run test:recache --help` or `bun run fixtures:capture:getcrumb --help`.
Both live modes require `FETCH_DEVEL=recache`, explicit `--live` and a successful
strict replay baseline. Generic recache protects static/fake/geographic fixtures;
country profiles are dated and append-only. Capture aborts on 429 without an
automatic retry or rollback of earlier captures. Earlier captures still need
review. The local runner never stages, commits or pushes fixtures.

Inspect HTTP status/payload before changing interfaces. Separate successful
response-shape drift from consent pages, rate limits, HTTP/API errors, assertion
changes and runtime bugs. Do not loosen a successful-response type for an error
payload. Keep concrete types and observed literal unions. Model new fields as
required first; add `?` only when successful fixtures for the same shape prove
omission. Check older/static/fake fixtures and distinguish omission from null,
empty objects and empty arrays. Record representative filenames; add JSDoc when
meaning is clear without guessing units or semantics.

Automated repairs may change interfaces, add observed plain strings to existing
nongeneric string-literal-union aliases, and regenerate schemas. Preserve alias
names/modifiers and every existing literal in order, including duplicates. Add
only distinct new plain string literals;
other alias edits require manual review. If runtime code, assertions or fixture
changes are needed, report evidence/proposed action and await operator feedback
for that repair while continuing independent type/schema work. Do not bypass
validation or widen types merely to pass tests.

Regenerate every affected schema before retrying tests, including consumers of
shared types (for example historical after chart changes). Replay focused
cached tests, then the full suite. Inspect schema diffs and final Git status;
do not recache during verification. Never retain transient 429, timeout, consent
or upstream 5xx payloads instead of successful fixtures. Preserve fixture bytes
and modes outside explicitly authorized capture.

## Builds, Workers and documentation

`bun run build:npm` creates generated `npm/`. `--version VERSION` sets package
and runtime metadata together. `--out-dir /absolute/new-or-empty-directory`
selects a new/empty external output whose canonical parent exists. Only default
`npm/` may replace recognized nonempty output with the builder's ownership
marker; move unmarked old output aside explicitly.
See [PACKAGING](tests/migration/PACKAGING.md). Source CLI help is
`bun bin/yahoo-finance.ts --help` or `bun bin/yahoo-finance-mcp.ts --help`;
data commands make live requests and are not offline checks.

Workers have a separate npm 10.9.9 graph hosted on Node 24.21.0. Follow
[WORKERS](tests/migration/WORKERS.md) for lock maintenance and private installation.
The maintained Linux integration command is explicit (no `test:cloudflare` alias):

```sh
python3 scripts/ci.py workers --bun /absolute/bun-1.4.3 \
  --node /absolute/node-24.21.0 --npm /absolute/npm-10.9.9/bin/npm-cli.js
```

It stages a private package/harness, performs registry acquisition separately,
then runs denied-network build/types and isolated-loopback Workers tests with
controlled fetch. Do not install this harness with Bun or regenerate its lock
with another npm major. See [CI](tests/migration/CI.md) for prerequisites and
job authorization. Read [TRUST-BOUNDARIES](tests/migration/TRUST-BOUNDARIES.md)
for CLI/MCP credential, transport and filesystem limits.

`bun run docs:gen` writes API HTML to owned `jsdocs/`; `bun run docs:lint`
validates without publishing output. `bun run docs:watch` rebuilds on the actual
source/tooling closure. `bun run docs:open` explicitly invokes the platform
opener; it does not generate or implicitly open a browser during other commands.
API docs cover all 28 export keys; [API_DOCS](tests/migration/API_DOCS.md) explains
warning debt, links, source provenance and output ownership. Prose lives under
`docs/`; JSR API documentation remains generated on publication.

## Commits and releases

Use [Conventional Commits](https://www.conventionalcommits.org/), with a scope
such as `fix(quote):`. Explain motivation and behavior in the body. `fix`, `feat`
and `BREAKING CHANGE` affect semantic-release's computed version/channel; do not
invent a production version. For agent commits, retain the footer required by
[AGENTS](AGENTS.md#commit-messages).

Run `node scripts/check-release-notes.mjs` after release tooling changes. Existing
release branch/channel policy is in `release.config.mjs` and
[workflow policy](docs/workflow-policy.md). The isolated publisher preparation
and release workflow migration have separate acceptance gates; never execute the
old Deno development build or root-manifest overwrite path. The
[release guide](docs/RELEASING.md) explains the initial prebuild, Node publisher
controller and isolated JSR prepare boundary. Local release controls perform no
authentication or publication; the publisher overlay and final integration
rehearsal have separate review gates. A semantic-release `--dry-run` skips
prepare and may still check auth, so it is not a complete safe prepare rehearsal. Real publication, credentials, tags, dist-tags and GitHub
release writes require separate authorization.

## Adding a module

1. Add `src/modules/myModule.ts` with concrete interfaces and `@yf-schema`.
2. Generate its schema and test with cached/synthetic data in a colocated test.
3. Export it from `src/modules/index.ts` and add the public `deno.json` export.
4. Add meaningful JSDoc and README module links; run types, schemas, replay and
   docs validation. New real fixtures require the separate capture workflow.
