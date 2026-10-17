# Releases on the Bun migration branch

The next major requires Bun >=1.4.3 for consumers. Node >=22.0.0 and Deno >=2.0.0
remain supported, and the JSR package remains part of the release. The breaking
runtime-floor commit supplies semantic-release's major-release signal; see the
[upgrade guide](./UPGRADING.md#next-major-bun-development-and-consumer-floor).
Current [development](./development.md), [CI](./ci.md) and
[packaging](./packaging.md) guides define ordinary pre-release checks.

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

## Nonpublishing verification

Use the maintained Linux test wrapper for the release controls:

```sh
bun run test:serial scripts/release-policy.test.ts scripts/workflow-policy.test.ts
node scripts/check-release-notes.mjs
node scripts/publisher/check-policy.mjs
```

The wrapper enforces the strict replay guard. The other commands check the pinned
release-note writer and synthetic analyzer/version/channel policy without
creating tags or contacting a publisher. See the [publisher contract](../scripts/publisher/README.md)
for the separate Linux publisher prerequisites and source/installed-consumer checks.

A complete publisher rehearsal must use the accepted composed source commit,
a new canonical absolute result directory outside the checkout, a synthetic
version, the pinned Bun binary and a checksum-verified Deno 2.0.0 binary:

```sh
node scripts/publisher/rehearse.mjs --publisher-rehearsal \
  --results /absolute/new-publisher-results --version 9.8.7-next.1 \
  --bun /absolute/pinned-bun-1.4.3 \
  --minimum-deno /absolute/checksum-verified-deno-2.0.0
```

This explicit publisher command owns Deno execution; it is not an ordinary
contributor test. Registry acquisition happens before the controlled cached/offline
runtime probes. The receipt must distinguish those phases. It checks a real packed
npm artifact, 28 ESM/CommonJS exports and declarations under Node/Bun, all three
installed bin version paths, and source plus installed-npm ESM consumers under
minimum and modern publisher Deno. It pairs SDK type positives with precise
negative diagnostics. Deno CommonJS support is not inferred from these ESM checks.
Without `--minimum-deno`, the command makes no Deno 2.0 acceptance claim.

Retain the new result directory, complete command statuses and logs, source commit,
root metadata hashes, tarball checksum/integrity, runtime binary versions/hashes,
notes/channel analysis and fixture byte/mode snapshots. Verify the root graph and
fixtures remain unchanged. Original failed or superseded rehearsals remain dated
evidence. A successful synthetic rehearsal does not push a tag, publish either
registry, create a GitHub release, exchange real OIDC credentials or prove
provenance acceptance. Final integration requires a new complete rehearsal on the
accepted composed head; earlier private overlays are historical evidence.

## Partial publication and recovery

A release is not one transaction. In pinned semantic-release 25.0.9,
[`index.js` lines 196–220](https://github.com/semantic-release/semantic-release/blob/v25.0.9/index.js#L196-L220)
run verification, notes and prepare, then create the Git tag, add channel notes,
push tags and push notes **before** running publish hooks. The configured publish
order is **npm → JSR → GitHub release**. The pinned
[publish definition](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/definitions/plugins.js)
uses the default stop-on-first-error
[pipeline](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/plugins/pipeline.js).
Later publish hooks are not reached after an earlier failure; already completed
remote effects remain. Git tag and notes pushes can also fail independently.

A failed job is therefore not evidence that nothing was released. Stop automatic
retries and preserve the run URL, exact workflow/source SHA, selected version,
channel, generated artifacts, checksums and every completed/failed step. The table
is an investigation aid; classify from remote observations, not only log messages.

| Observed state for the exact version | Possible boundary | Required decision after inventory |
| --- | --- | --- |
| No remote tag and no registry artifact | Preflight/verification/prepare failure, or a failed tag push | Fix the cause and review the version/channel decision before authorizing another release attempt. Check local and remote refs separately. |
| Remote tag, with notes present or missing; no npm/JSR artifact | Tag/notes pushes completed partly or fully; npm publication was not confirmed | Preserve the tag/SHA and note state. Review an explicit completion or follow-up release plan; a workflow rerun is not a repair plan. |
| npm version exists; JSR version and GitHub release absent | npm completed before JSR, or an npm acknowledgement was lost | Verify npm bytes, provenance and dist-tag. Authorize only a reviewed missing-destination plan or a new release; do not republish npm. |
| npm and JSR versions exist; GitHub release missing | GitHub publication failed after both registries | Verify both artifacts and identities, then separately authorize the missing GitHub release/asset work if appropriate. |
| All artifacts/releases exist, but the job failed | A later success hook or acknowledgement may have failed | Inspect release notes, assets, channels and provenance before declaring completion or approving any remaining metadata repair. |
| Timeout, disconnect or conflicting registry/UI responses | The server may have accepted an operation before its acknowledgement was lost | Treat the state as unknown. Repeat read-only inventory and resolve visibility/cache/auth errors before any write. |

### Read-only inventory before any repair

An operator should first authorize read-only remote inspection. These examples
are inspection recipes, not commands run by ordinary tests or by the rehearsal.
Use an independent disposable inspection checkout and record timestamps and full
responses without exposing credentials. Replace the version with the exact value
from the failed run; never use `latest` to identify an artifact.

```sh
release_version='REPLACE_WITH_EXACT_VERSION'
release_tag="v${release_version}"
release_repo='https://github.com/gadicc/yahoo-finance2'
git ls-remote --exit-code "$release_repo" \
  "refs/tags/$release_tag" "refs/tags/$release_tag^{}"
git ls-remote "$release_repo" \
  "refs/notes/semantic-release-$release_tag" "refs/notes/semantic-release"
node node_modules/npm/bin/npm-cli.js view "yahoo-finance2@$release_version" \
  version gitHead dist.integrity dist.shasum dist.tarball dist.attestations \
  --registry=https://registry.npmjs.org --json
node node_modules/npm/bin/npm-cli.js view yahoo-finance2 dist-tags \
  --registry=https://registry.npmjs.org --json
```

Use the pinned Node/npm controller from a frozen inspection-tool checkout; do
not install tools into the failed publisher workspace. Record both tag object and
peeled commit where applicable, and compare the commit to the failed run's source
SHA. `ls-remote` reports refs without updating the remote. Fetching exact refs and
notes into the disposable inspection checkout may be needed to read their
contents; that changes only the inspection copy and still needs the read-only
inspection authorization. Check channel notes against `release.config.mjs` and
the generated notes. A nonzero command or unavailable metadata is not proof of
absence: separate a confirmed missing version/ref from authentication, transport
and registry visibility errors. See [Git ref inspection](https://git-scm.com/docs/git-ls-remote)
and [npm view](https://docs.npmjs.com/cli/v11/commands/npm-view/).

For npm, download the exact reported tarball into private inspection scratch
without installing it or running its scripts. Verify its registry integrity and
compare its bytes/manifest/version/28-export inventory to the retained release
artifact. Record the current dist-tags independently of immutable version bytes;
check the intended branch/channel rather than assuming `latest`. Inspect and
cryptographically verify the published provenance/signature evidence against the
actual repository, workflow, source SHA and artifact digest using the supported
[npm provenance verification](https://docs.npmjs.com/generating-provenance-statements/)
procedure in a separate inspection graph. A metadata link or a local checksum
alone is not proof of provenance.

For JSR, inspect the exact version on the package page and its provenance link.
The public [JSR registry API](https://jsr.io/docs/api) provides package metadata at
`https://jsr.io/@gadicc/yahoo-finance2/meta.json` and immutable version metadata at
`https://jsr.io/@gadicc/yahoo-finance2/<VERSION>_meta.json`. Record exports, file
checksums and source paths, compare them with the retained staged source, and
verify the linked [provenance identity](https://jsr.io/docs/trust). Inspect yanked
status in package metadata separately. The npm compatibility endpoint can lag
JSR's native metadata; a missing compatibility tarball alone does not establish
that native publication failed.

Inspect the GitHub release for the exact tag in the repository's Releases page.
Record draft/prerelease state, notes, target/tag commit, asset names, sizes and
checksums. Compare its notes and assets with the retained run and both registry
artifacts. A GitHub release object, Git tag, npm dist-tag and JSR version are
separate observations; none proves all others completed.

### Separately authorized recovery

Write down the observed state and the intended changes before obtaining repair
authorization. A rerun can see the already-pushed tag as the last release and find
no eligible commits; it does not automatically resume the missing publish hook.
Do not delete or move tags, reset release history, unpublish as rollback, or try to
replace an existing immutable version. npm documents that a published name/version
[cannot be reused even after removal](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

If released code is defective, restore the desired last-good behavior through a
reviewed follow-up source fix or revert commit and a new release. That preserves
published history. A channel/dist-tag change can redirect consumers to an already
verified version, but it does not replace artifacts or repair their provenance;
such a change needs separate authorization and an explicit before/after channel
inventory. Do not promise automated rollback or cross-registry atomicity.

A missing destination, Git note, release note or asset requires its own reviewed
completion plan bound to the existing tag/SHA, exact artifact and real trusted
publisher permissions. Never fabricate CI/OIDC context, disable provenance, or
reuse a synthetic rehearsal version to work around authorization. This guide
performs no remote recovery and does not authorize publication.
