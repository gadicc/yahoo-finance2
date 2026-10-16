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

After this migration is merged, select a compatible recorded drift and repair
base before running an authentication smoke test. Use full 40-character
lowercase hexadecimal commit SHAs; the placeholders below are not commit IDs.

1. In a clean, trusted checkout of the `dev` commit that will supply the workflow
   (`github.workflow_sha`), select a repair base reachable from `origin/dev`.
   Its tree must contain `package.json`, `bun.lock`, `.bun-version`, and
   `scripts/ci_repair.py`, plus every other required input checked by the
   coordinator. The entire executable/config closure must match that trusted
   workflow commit exactly, including tracked paths, modes and contents for the
   Bun lockfile, scripts, adjacent tests, test support and compiler/Biome
   configuration. Merely containing the four named files is insufficient.
2. Select a recorded drift commit with exactly one parent and at least one
   change, all within unprotected flat `tests/fixtures/http/*.json` paths.
   Static, fake and `getCrumb-geo-*` fixtures are excluded. The drift must be an
   ancestor of the selected base, and the base's complete HTTP fixture tree must
   match the recorded drift. Use the positive tracking issue number for that
   drift. Do not invent a drift SHA or substitute an unrelated old fixture set.
3. Check ancestry and fixture parity with `git merge-base --is-ancestor` and
   `git diff --exit-code`, inspect the drift's parent and changed paths, and run
   the coordinator's read-only compatibility check from that trusted checkout:

   ```sh
   DRIFT_SHA='<full 40-character fixture-drift SHA>'
   REPAIR_BASE_SHA='<full 40-character compatible dev SHA>'
   git merge-base --is-ancestor "$REPAIR_BASE_SHA" origin/dev
   git merge-base --is-ancestor "$DRIFT_SHA" "$REPAIR_BASE_SHA"
   git rev-list --parents -n 1 "$DRIFT_SHA"
   git diff-tree --no-commit-id --name-only -r "$DRIFT_SHA"
   git diff --exit-code "$DRIFT_SHA" "$REPAIR_BASE_SHA" -- tests/fixtures/http
   python3 -I -B - "$REPAIR_BASE_SHA" <<'PY_CHECK'
   import runpy
   import sys
   runpy.run_path("scripts/ci_repair.py")["compatible"](sys.argv[1])
   PY_CHECK
   ```

   The workflow also enforces all drift/base checks before federation. A local
   check does not bypass those checks. If no compatible recorded drift/base
   pair exists, there is no authentication smoke test to run yet; leave
   automatic repairs disabled until a suitable reviewed pair is available.

The old `c6612bd84dc6af570d1d2eef74b49182f6170e23` smoke example is historical
and unsupported under this migration: it lacks the required Bun/tooling closure
and is rejected before federation. It is not a current repair-base example.

Once those checks pass, open
[the recache workflow](https://github.com/gadicc/yahoo-finance2/actions/workflows/recache-yahoo-fixtures.yaml),
select **Run workflow** on `dev`, and use:

| Input          | Value                                         |
| -------------- | --------------------------------------------- |
| `repair_only`  | `true`                                        |
| `drift_commit` | `<full 40-character fixture-drift SHA>`        |
| `repair_base`  | `<full 40-character compatible dev SHA>`       |
| `issue_number` | `<positive tracking issue number>`            |
| `dry_run`      | `true`                                        |
| `auth_only`    | `true`                                        |

This validates federation without invoking the model, recaching Yahoo, pushing,
or opening a PR. The successful federation step reports that the proxy is ready.
Manual `repair_only` runs work even while automatic repairs are disabled. Repeat
with the same compatible inputs and `auth_only=false` to test the agent and
independent verifier. Leave `dry_run=true` for both smoke checks: neither run
publishes. Set `SCHEMA_REPAIR_ENABLED=true` only after both checks succeed. If
the model reports a quota error, resolve API billing/credits or the applicable
spend/usage limit before retrying; leave automatic repair disabled while
resolving it.

For a current unresolved fixture-drift commit, use its full SHA and tracking
issue number. When retrying after an automation update on `dev`, set the
optional `repair_base` input to the current full `dev` SHA. The recorded
`drift_commit` must be its ancestor, and all HTTP fixtures must match that
recorded snapshot. The agent uses the recorded drift's parent for evidence while
repairing/testing the newer base. Leaving `repair_base` empty retains the
original recorded base. Set `dry_run=false` to publish after verification. The
publisher rejects a stale base if `dev` has moved, and leaves existing repair
branches/PRs untouched. Disabling `SCHEMA_REPAIR_ENABLED` stops automatic repair
runs; disabling the OpenAI mapping prevents new federated exchanges.

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
  changes and additions to existing nongeneric string-literal-union aliases.
  Alias edits preserve names, modifiers, and existing literals in order
  (including duplicates); new values must be distinct plain string literals
  supported by successful fixtures. It rejects other alias edits, runtime/import
  changes and broad shortcuts, regenerates schemas independently, then runs
  formatting, lint, type checks and cache-only tests. More complicated repairs
  return a blocked result for manual work.
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

## Bun workflow compatibility

The migration workflow uses exact Bun 1.4.3 and Node 24.21.0, a fresh frozen
trusted dependency installation, and the reviewed Linux guard. It never invokes
a Deno binary. Repair verification and draft-PR restoration use trusted
workflow-sha AST code; no candidate lifecycle hooks run.

A manual historical `repair_base` must have the workflow's exact maintained
Bun/tooling/configuration closure and the recorded fixture tree. A Deno-only or
otherwise incompatible base fails before candidate installation or federation.
Select a compatible newer trusted `dev` commit through `repair_base`, preserving
the drift fixtures; no automatic dependency upgrade or unlocked bootstrap occurs.

Full generation checks every schema consumer. If an imported type changes a
schema outside the module-only artifact scope, the repair needs manual work;
the verifier does not omit that consumer. The exact action adaptation, guard
limits, offline reproduction and pending remote proof are documented in
[CI repair migration evidence](../tests/migration/CI-REPAIR.md). Workflow triggers,
the existing daily schedule, `SCHEMA_REPAIR_ENABLED`, `auth_only` and dry-run
publication controls retain their existing meanings.
