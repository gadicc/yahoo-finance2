# Automatic schema repair PRs

The daily recache workflow can propose a draft repair PR after it records
response drift and opens a tracking issue. Repairs target `dev`. Publication and
merging remain separate manual decisions.

Each repair PR includes concise maintainer advice with a bold recommended
action. Newly added fields accepted by default validation can wait for the next
planned release; repairs to failures affecting default validation recommend
merging to `main` when ready. The advice cites fixture evidence and accounts for
users who opt into strict validation. See
[additional result properties](./validation.md#note-additional-props).

Authentication uses GitHub OIDC and OpenAI Workload Identity Federation (WIF).
There is no long-lived OpenAI key in GitHub. Automatic repair stays disabled
until `SCHEMA_REPAIR_ENABLED` is set to `true`.

## One-time OpenAI setup

1. Open
   [OpenAI Projects](https://platform.openai.com/settings/organization/projects).
   Use a dedicated project (for example `yahoo-finance2-schema-repair`) and
   create a service account named `github-schema-repair`. Give it model
   Responses request access only. Do not save a service-account API key in
   GitHub; this workflow uses federation. Project and service-account names are
   labels; authentication uses IDs. An existing project does not need to be
   renamed.
2. Set a project hard monthly spend limit and a lower spend alert. A reasonable
   initial limit is $20/month with a $10 alert; adjust after observing usage.
   Spend alerts alone do not stop requests, and hard-limit enforcement can have
   a short delay. See
   [OpenAI spend controls](https://developers.openai.com/api/docs/guides/spend-limits).
   The cap does not fund API usage. Check the organization's
   [API billing](https://platform.openai.com/settings/organization/billing/overview)
   and [limits](https://platform.openai.com/settings/organization/limits) for
   available credits/payment setup and usage limits. A successful federation
   exchange alone does not verify billing or model-request permissions.
3. Open
   [Workload Identity Providers](https://platform.openai.com/settings/organization/security/workload-identity-provider)
   and create a provider with these settings:

   | Setting                   | Value                                         |
   | ------------------------- | --------------------------------------------- |
   | Name                      | `yahoo-finance2-github`                       |
   | OIDC issuer URL           | `https://token.actions.githubusercontent.com` |
   | Audience                  | `https://api.openai.com/v1`                   |
   | Use uploaded JWKS         | Disabled (use GitHub discovery)               |
   | Attribute transformations | None needed                                   |

4. Create an enabled service-account mapping named `schema-repair-dev` targeting
   the project and service account above. Add these **exact Key/Value assertion
   rows**, all of which must match:

   | Key                   | Value                                                                                |
   | --------------------- | ------------------------------------------------------------------------------------ |
   | `repository`          | `gadicc/yahoo-finance2`                                                              |
   | `repository_id`       | `332135599`                                                                          |
   | `repository_owner_id` | `381978`                                                                             |
   | `ref`                 | `refs/heads/dev`                                                                     |
   | `environment`         | `schema-repair`                                                                      |
   | `workflow_ref`        | `gadicc/yahoo-finance2/.github/workflows/recache-yahoo-fixtures.yaml@refs/heads/dev` |
   | `sub`                 | `repo:gadicc/yahoo-finance2:environment:schema-repair`                               |

   In the permissions UI, enable **Responses (`/v1/responses`)** with
   **Write/Request** access, using the label offered by the dashboard. The
   expanded permission summary should include `api.responses.write`;
   `api.responses.read` is optional because the proxy only creates responses.
   Leave other model capabilities disabled. The documented `api.model.request`
   scope covers model requests; `api.model.read` means **List models
   (`/v1/models`)**, which this workflow does not need because the model is
   configured explicitly. See
   [OpenAI permission definitions](https://developers.openai.com/api/docs/guides/rbac).
   Copy the provider ID and service-account ID; these IDs are not secrets. See
   the
   [official GitHub WIF setup](https://developers.openai.com/api/docs/guides/workload-identity-federation/github-actions).

## GitHub configuration

The `schema-repair` environment should allow only the `dev` branch and have no
required reviewers, so scheduled repairs can run unattended. Configure it at
[repository environments](https://github.com/gadicc/yahoo-finance2/settings/environments).

At
[Actions variables](https://github.com/gadicc/yahoo-finance2/settings/variables/actions),
set:

| Variable                      | Value                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `OPENAI_IDENTITY_PROVIDER_ID` | The OpenAI provider ID                                                         |
| `OPENAI_SERVICE_ACCOUNT_ID`   | The OpenAI service-account ID                                                  |
| `SCHEMA_REPAIR_ENABLED`       | Leave `false` until authentication and the model dry run pass; then set `true` |
| `SCHEMA_REPAIR_MODEL`         | Optional; defaults to `gpt-6.1-sol`                                            |

No `OPENAI_API_KEY` secret is needed. The model must be available to the
project. The proxy restricts requests to that exact configured model and the
Responses endpoint. Changing the model requires updating only
`SCHEMA_REPAIR_MODEL`.

At
[Actions settings](https://github.com/gadicc/yahoo-finance2/settings/actions),
enable **Allow GitHub Actions to create and approve pull requests**. The
workflow does not approve or merge PRs; this setting permits draft PR creation.

## Check authentication, then test a repair

Open
[the recache workflow](https://github.com/gadicc/yahoo-finance2/actions/workflows/recache-yahoo-fixtures.yaml),
select **Run workflow** on `dev`, and use:

| Input          | Value                                      |
| -------------- | ------------------------------------------ |
| `repair_only`  | `true`                                     |
| `drift_commit` | `c6612bd84dc6af570d1d2eef74b49182f6170e23` |
| `issue_number` | `1030`                                     |
| `dry_run`      | `true`                                     |
| `auth_only`    | `true`                                     |

This validates federation without invoking the model, recaching Yahoo, pushing,
or opening a PR. The successful federation step reports that the proxy is ready.
Manual `repair_only` runs work even while automatic repairs are disabled. Repeat
with `auth_only=false` to test the agent and independent verifier against the
already-fixed historical drift. Leave `dry_run=true`: historical commits are
suitable for smoke testing, not publication. Set `SCHEMA_REPAIR_ENABLED=true`
only after both checks succeed. If the model reports a quota error, resolve API
billing/credits or the applicable spend/usage limit before retrying; leave
automatic repair disabled while resolving it.

For a current unresolved fixture-drift commit, use its full SHA and tracking
issue number. Set `dry_run=false` to publish after verification. The publisher
rejects a stale base if `dev` has moved, and leaves existing repair branches/PRs
untouched. Disabling `SCHEMA_REPAIR_ENABLED` stops automatic repair runs;
disabling the OpenAI mapping prevents new federated exchanges.

## Isolation and verification

The [security architecture](../.github/workflows/schema-repair-security.md),
stored beside the workflow, explains each boundary, its rationale, and its
limits. The main boundaries are:

- The repair job has read-only repository access and OIDC issuance permission.
  It uses a fresh checkout of the trusted workflow commit and a separate
  checkout of the recorded fixture-only drift commit.
- A root-owned proxy renews GitHub OIDC and OpenAI credentials in memory. The
  pinned Codex action drops sudo; its agent process receives neither the OIDC
  request credentials nor the OpenAI access token. Only a temporary local proxy
  credential is passed to the action. The proxy expires automatically.
- Only bounded JSON text replacements cross into verification. No agent-created
  scripts, git state, caches, or runner state are carried forward. Comments and
  upstream text remain untrusted evidence.
- The verifier parses source without executing it. It allows interface data
  changes, rejects runtime/import/alias changes and broad shortcuts, regenerates
  schemas independently, then runs formatting, lint, type checks and cache-only
  tests. More complicated repairs return a blocked result for manual work.
- The publisher restores only the verified source/schema files on another fresh
  checkout. Trusted code receives a write token only for branch/PR publication.
  It creates `codex/schema-drift-<issue>` and a draft PR targeting `dev`.
- Human review still decides whether the types reflect successful fixtures.
  Passing tests does not establish every field's semantics or optionality.

OpenAI API federation tokens cannot outlive their upstream identity tokens. The
proxy renews before expiration, rather than assuming a one-time token exchange
lasts for an entire agent run. See the
[token exchange reference](https://developers.openai.com/api/reference/workload-identity-federation).

PRs created with `GITHUB_TOKEN` may require approval to run ordinary PR
workflows. The independent verification job already runs before PR creation. See
[GitHub's workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
