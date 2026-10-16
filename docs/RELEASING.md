# Releases on the Bun migration branch

The next major requires Bun >=1.4.3 for consumers. Node >=22.0.0 and Deno >=2.0.0
remain supported, and the JSR package remains part of the release. The breaking
runtime-floor commit supplies semantic-release's major-release signal; see the
[upgrade guide](./UPGRADING.md#next-major-bun-development-and-consumer-floor).

## Eligibility and required checks

[release.config.mjs](../release.config.mjs) retains the existing maintenance,
`master`, `main`, `next`, `next-major`, `beta` and `alpha` branches. The latter two
retain their named prerelease channels. The Release workflow keeps its original
push filters, manual trigger, branch-ref guard and noncanceling concurrency.
[Workflow policy](./workflow-policy.md) describes eligibility. Reusable Tests,
including its Linux/macOS/Windows native matrix, must succeed before publishing.
A local synthetic check does not establish that a future workflow run will pass.

The publisher uses `ubuntu-24.04`, whose setup provisions the strict test guard,
Node 24.21.0 as its controller,
and Bun 1.4.3 from `.bun-version` for frozen installation and builds. Run normal
contributor checks with Bun; do not install Deno for development, tests, builds,
formatting, linting or API documentation.

## Build and publisher order

1. The shared setup validates exact tool pins and performs the authoritative
   `bun install --frozen-lockfile`, including normal lifecycle hooks.
2. `bun run build:npm` creates the initial `npm/package.json`. The pinned npm
   plugin reads this package's real name during `verifyConditions`, before any
   `prepare` hook. Removing this early build breaks that ordering.
3. `node scripts/release-policy.mjs` checks branch eligibility, controller and
   locked publisher versions, explicit npm provenance, private root metadata,
   public repository identity, consumer engines and all 28 export keys. This is
   a read-only preflight. Fixed `/usr/bin/git` on the Ubuntu release host checks
   the canonical checkout, ignoring inherited `GIT_*` redirection/configuration
   variables. A bounded merged config query resolves conditional includes and
   inspects key names only, rejecting stored HTTP headers/credential keys without
   printing values. It makes no authentication or registry request.
4. Node invokes the local semantic-release CLI. Its analyzer selects the next
   version. The exec prepare hook runs the Bun versioned builder, updating
   generated package/runtime metadata together. npm's subsequent prepare step
   operates on `pkgRoot: "npm"`.
5. The JSR wrapper prepares a separate private publisher checkout. Its manifest,
   source inventory, runtime launcher and cleanup are described in the
   [publisher contract](../scripts/publisher/README.md). Deno may run only inside
   this isolated publisher boundary, including JSR's verification dry run. The
   root private `package.json`, `bun.lock` and `deno.json` remain unchanged.

Do not replace the root manifest with a fabricated public package. Do not run
`semantic-release --dry-run` as a substitute for local prepare checks: it still
runs verification/authentication hooks and skips prepare. The migration's local
controls invoke only the analyzer, notes/version functions, builder and the
npm plugin's internal local metadata/prepare functions. They do not invoke npm
verification, OIDC exchange, GitHub release creation or either registry publish.

## Identity, credentials and provenance

The publisher job retains `contents`, `issues` and `pull-requests` write
permissions for the existing GitHub release plugin, and `id-token: write` for
registry identity. `GITHUB_TOKEN` is passed only to the release step. No new npm
or JSR long-lived token is added. Both checkout steps explicitly use
`persist-credentials: false`. The publisher's setup, installation and prebuild
therefore do not inherit a checkout-stored Git write token. A bounded preflight
rejects HTTP extraheader/credential keys in both local and worktree configuration,
including conditional includes evaluated against the merged configuration. It
strips inherited Git repository/configuration
redirects for these read-only queries and verifies the canonical checkout root.
The key-only query uses NUL-paired scope/key records, then selects local/worktree
entries. This preserves conditions that depend on a remote URL in the other scope
when `extensions.worktreeConfig` is enabled. NUL framing keeps key text separate
from its recorded scope.
Values and helper bodies never enter diagnostics; helpers never execute. This
checks checkout-local/worktree configuration, not arbitrary global/environment
credential sources or a general process sandbox. Fixed `/usr/bin/git` is an
Ubuntu release-host requirement, not a portable consumer requirement. Git
documents these [local/worktree and include scopes](https://git-scm.com/docs/git-config)
and [repository environment overrides](https://git-scm.com/docs/git).

The pinned semantic-release Git URL helper can derive HTTPS `x-access-token`
authentication from the release step's sole `GITHUB_TOKEN` when `GITHUB_ACTION`
is present. A maintained control executes that exact module with only its Git
transport dependency replaced by a rejecting local adapter; it validates URL
selection without a real auth request. Actual remote permissions remain a release
prerequisite. Reusable Tests retains its separate Codecov identity permission.

The frozen graph resolves `@semantic-release/npm` 13.2.0 to npm 11.21.1. The
plugin starts `npm` with `preferLocal: true`, so the checkout's
`node_modules/.bin/npm` is the relevant CLI. Its GitHub token exchange requests
the audience `npm:registry.npmjs.org` for the prebuilt public package name. The
publisher explicitly sets `NPM_CONFIG_PROVENANCE=true`: the pinned plugin's
`npm publish` command does not itself add `--provenance`.

npm's trusted-publisher configuration must match the real GitHub repository and
workflow filename (`release.yaml`), and any configured environment. npm documents
GitHub-hosted runners and minimum CLI/controller requirements for this flow.
Those registry settings and successful OIDC exchange require an authorized real
release; local checks do not verify them. See
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/) and
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/).

JSR provenance remains the publisher wrapper's responsibility. Preserve matching
Git commit/origin/source paths in that isolated checkout; do not fabricate CI
identity or disable provenance to make verification pass. See
[JSR publishing](https://jsr.io/docs/publishing-packages) and
[JSR trust](https://jsr.io/docs/trust).

## Local verification and pending integration

Run `bun test scripts/release-policy.test.ts scripts/workflow-policy.test.ts`
inside the maintained offline guard. The real prepare control has an explicit
60-second outer budget; the exact Git-helper control has a 15-second outer
budget and a 10-second child deadline. Child tools keep their own bounded controls.
Run `node scripts/check-release-notes.mjs` for the pinned writer compatibility
check. All writes belong to disposable scratch, and no publication is attempted.

The J03/J04 review snapshot uses accepted commit `ef34bc52` plus the frozen
J01/J02 v2 publisher overlay. Its owner is separately correcting v3 Git-binding
findings. Integration with its accepted successor and the current branch still
needs a rehearsal; this snapshot does not claim a completed real npm/JSR release
or successful provenance exchange.
