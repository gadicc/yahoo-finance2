# Workflow policy

| Workflow                                                                   | Automatic runs                                                                                                         | Manual or reusable runs                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Tests](../.github/workflows/tests.yaml)                                   | All PRs, including drafts and bot PRs, on `opened`, `synchronize`, `reopened`, and `ready_for_review`; pushes to `dev` | Manual on any ref; reusable call from Release                                            |
| [Release](../.github/workflows/release.yaml)                               | Pushes to configured release branches                                                                                  | Manual on an eligible release branch                                                     |
| [Recache Yahoo fixtures](../.github/workflows/recache-yahoo-fixtures.yaml) | Daily at 03:37 UTC on `dev`                                                                                            | Manual on `dev`; repair follows detected drift or an explicit repair-only retry on `dev` |
| [Copilot Setup Steps](../.github/workflows/copilot-setup-steps.yml)        | PRs and `dev` pushes that change its workflow, shared setup, Bun pins/lock/manifest, strict guard/AppArmor helpers, or Workers lock  | Manual validation remains available                                                      |

Tests do not automatically run on feature-branch pushes. Opening or updating a
PR supplies that coverage, including for existing dependency PRs. Ordinary core
CI tests produce coverage in replay-only mode: they make no live Yahoo requests
and cannot write fixtures. Cloudflare Workers tests use mocked HTTP responses. The Tests workflow also runs
the API documentation warning gate and calls the same-commit native platform
matrix. Native replay is an explicit trusted scope; it does not replace strict
Linux CI.

Push triggers use the workflow files on the branch being pushed. Existing
branches pick up this policy when they merge or rebase onto the updated `dev`;
changing `dev` alone does not rewrite other branches' workflows or past runs.

Standalone PR and `dev` Tests runs cancel obsolete runs for the same PR or
branch. Release and recache runs never cancel an in-progress run.

## Release eligibility

[release.config.mjs](../release.config.mjs) is the source of truth for release
branches. The configured named branches are `main`, `master`, `next`,
`next-major`, `alpha`, and `beta`; maintenance branches use `N.x`, `N.N.x`, or
`N.x.x` (numeric version components). Both push and manual Release runs are
guarded against the actual branch ref. Tags, `dev`, and feature branches are
ineligible.

Release calls reusable Tests once before publishing. Release-branch pushes do
not also start standalone Tests. Keep the Release trigger filters and the guard
in [scripts/workflow-policy.mjs](../scripts/workflow-policy.mjs) aligned with
the release configuration whenever this policy changes.

Release uses the pinned Node controller and Bun frozen setup on `ubuntu-24.04`.
It builds public npm metadata before publisher verification, validates the locked
publisher inputs and absence of checkout-local/worktree credential keys, including
conditional includes evaluated against merged configuration before filtering
NUL-paired scope/key records. Read-only key queries ignore Git redirection environment and
bind the canonical checkout; they do not audit arbitrary global credentials.
Then semantic-release prepares the selected version. Publisher checkout explicitly
disables credential persistence; its final release step receives `GITHUB_TOKEN`.
`NPM_CONFIG_PROVENANCE=true` explicitly requests npm provenance; registry trust
settings and successful OIDC exchange remain external release prerequisites.
The private root manifest is preserved. See [release guidance](./RELEASING.md)
for the isolated JSR boundary and the limits of local nonpublishing proof.

## Fixture maintenance and bot runs

The daily recache schedule depends on the repository's current default branch
being `dev`; GitHub may delay scheduled runs. Live fixture capture and schema
repair stay in the recache workflow. See
[Automatic schema repair PRs](./schema-repair.md) for repair controls and
verification.

Pushes made with `GITHUB_TOKEN` do not trigger normal push CI. PR workflows may
require approval under repository or organization policy; the repair pipeline
still runs its independent verifier before publishing a repair PR. This policy
does not change dependency bots, automerge settings, or branch protection.
