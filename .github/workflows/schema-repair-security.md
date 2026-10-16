# Schema repair security architecture

This document explains the security decisions in
[recache-yahoo-fixtures.yaml](./recache-yahoo-fixtures.yaml). Operational setup,
including exact OpenAI trust-mapping assertions, is in
[docs/schema-repair.md](../../docs/schema-repair.md). Keep this document in sync
when changing the workflow, proxy, verifier, or publication rules.

The goal is to let an agent propose fixes to Yahoo response schemas while
keeping repository publication and federation credentials under trusted code's
control. Yahoo responses, fixtures, test output, issue text, and the agent's
proposal can contain malicious or mistaken content. The design assumes GitHub's
hosted runner, the configured OpenAI provider, and maintainer-controlled `dev`
code and dependencies are trusted.

## Job boundaries

| Job              | Capabilities                                                                        | Handoff                                             | Reason for separation                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recache`        | Fetch Yahoo responses; write fixture commits to `dev`; open tracking issues         | Recorded commit SHA and issue number                | The existing trusted recache code records evidence; an agent never gets its write token.                                                                   |
| `repair`         | Read repository; obtain OIDC identity through a protected proxy; run Codex          | Bounded JSON proposal through a job output          | A compromised agent can propose data changes, but cannot use this job's repository token to publish them.                                                  |
| `verify-repair`  | Read repository; validate proposed interfaces; regenerate schemas; run cached tests | Verified source/schema contents in a named artifact | Verification uses a fresh runner, trusted scripts, and independent regeneration, without model credentials, OIDC issuance, or repository write permission. |
| `publish-repair` | Restore verified files; create a branch and draft PR                                | Draft PR targeting `dev`                            | Publication happens on another fresh runner, where trusted code controls the write token and never executes proposed module code.                          |

Jobs run in sequence in the same workflow. An issue opened by recache is a
tracking record, not an execution trigger. This avoids depending on issue text,
labels, mentions, or comments for authorization, and works without introducing a
long-lived GitHub App token or PAT to trigger another workflow.

## Who can start a repair

Automatic repair requires a successful recache job with a recorded drift SHA,
`SCHEMA_REPAIR_ENABLED=true`, and the workflow running on `dev`. Authorized
maintainers can also dispatch `repair_only` on `dev`, including while automatic
repair is disabled. There are no issue, pull-request, fork, or comment triggers.
This keeps public contributors' text out of the authorization path.

Downstream job conditions explicitly require successful proposal/verification
jobs and reject cancellation. They override GitHub's implicit status check so a
manual repair can intentionally skip recache without also skipping verification.
An unsuccessful verifier can never authorize publication.

The `schema-repair` GitHub environment permits only `dev`. No required reviewers
are configured so scheduled repairs can run unattended; the draft PR provides
the human review boundary before merging. Changes to this environment, workflow,
repository variables, or OpenAI mapping are privileged maintainer operations.

The workflow validates full drift/base commit SHAs and a positive issue number.
The repair base must be an ancestor of repository `dev`. The recorded drift's
changed paths must be non-static, non-fake HTTP fixtures with restricted
filenames. This prevents using the manual entry point to supply an arbitrary
fork or a commit changing executable code. It does not prove that a fixture
contains a valid successful response; the agent and reviewer must still inspect
HTTP status and payload.

Manual retries can supply `repair_base` after an automation update. The recorded
fixture-only drift must be an ancestor of that trusted `dev` base, and a Git
diff must confirm that the complete HTTP fixture tree is unchanged between them.
This allows new verifier/prompt code to repair the same recorded evidence
without recaching or publishing a patch from a stale base. The publisher still
requires remote `dev` to equal the verified base.

## Trusted code and dependencies

Each repair-stage job checks out `github.workflow_sha` for its prompt, scripts,
and configuration. A separate sibling worktree at `${github.workspace}-schema-repair-candidate`
holds the selected repair base, with the recorded fixtures preserved. Keeping it
outside the trusted checkout prevents compiler ancestor searches from entering
the trusted checkout’s separate dependency graph. The verifier and publisher invoke the AST apply/bundle/restore script from the
trusted checkout, not an agent-produced script. Test/type tooling in the
candidate must match the trusted workflow checkout byte for byte and remains
read-only while executing. This prevents a proposal from replacing the guard that
judges it.

The repair, verification, and publication actions are pinned to commit SHAs; the
Codex CLI, Bun development runtime and Node tool host have exact versions.
Only the trusted workflow graph is installed with `bun install --frozen-lockfile`
and normal lifecycle hooks; candidate hooks never run. These choices make changes to those components
reviewable. SHA pins still require review before updates and do not establish
that a dependency is safe. The existing recache job's local setup remains part
of the trusted repository code.

Dependency caches from the agent job are not reused in verification or
publication. Fresh jobs install the trusted graph themselves. A coordinator-owned real private copy of the frozen graph lives at
`candidate/node_modules`; bytes, modes and relative internal links are validated
before verification or restore. No link can leave the graph and copied regular
files share no writable inode with the trusted installation. This preserves the
builder/compiler's existing own-input checks; a borrowed SDK alias is refused. There is no candidate installation,
lifecycle execution, lockfile repair or unlocked fallback.

Before preparing a candidate or starting federation, the selected base must
contain the exact executable/configuration closure from the workflow checkout:
all `scripts/` files and adjacent `*.test.*` cases; executable and JSON test-support files outside fixture,
result and documentation data; root Bun/package/lock/TypeScript/Biome/loader and
Git configuration inputs. Modes and blob identities must match, and the trusted
working files must still match their committed blobs. Missing Bun metadata or
historical Deno-only tooling produces an explicit incompatible-base failure.
Choose a compatible trusted `dev` repair base with the same recorded fixtures;
this automation never bootstraps an old dependency graph or runs its scripts.

## Federated credentials

GitHub OIDC is exchanged for a short-lived OpenAI access token. Provider and
service-account IDs are ordinary GitHub variables; there is no long-lived OpenAI
API key in GitHub. A dedicated OpenAI project/service account keeps model access
and spending separate from other workloads. The mapping grants Responses request
access rather than administrative APIs or unrelated model capabilities. Model
listing (`api.model.read`) is unnecessary because the workflow configures its
model explicitly. The dashboard's Responses write selection grants
`api.responses.write`; optional Responses read access is not used by the proxy.
The proxy also independently enforces the endpoint and model.

The OpenAI mapping binds the repository name and stable repository/owner IDs,
`dev`, the exact workflow path/ref, and the `schema-repair` environment/subject.
Repository IDs help avoid trusting a different repository that acquires the same
name. Pinning the workflow path avoids accepting any other workflow merely
because it has a matching display name. The local proxy checks those claims,
issuer, audience, event type, and expiration as well. OpenAI performs signature
verification and mapping enforcement; decoding the JWT locally is only an
additional configuration check.

OpenAI tokens cannot outlive their upstream identity token, which may expire
during an agent run. The proxy renews with a one-minute margin, shares
concurrent renewals, and retries once after an upstream authentication failure.
This avoids relying on a single initial exchange or on a stored refresh
credential.

### Why the proxy runs as root

[start-openai-wif-proxy.mjs](../../scripts/start-openai-wif-proxy.mjs) passes
the GitHub OIDC request credentials to a root-owned process through stdin. Its
environment is cleared, its script is copied into a root-only directory, and
federation tokens remain in process memory. The startup exchange fails before
Codex runs if configuration is wrong. Credential-bearing configuration is not
written to a file or supplied as command-line arguments.

The official Codex action stays pinned to
`bdf19a4a223ec2549a3e2274a0cf61556bc07675`, checked out outside `candidate`.
That upstream version changes global Linux user-namespace sysctls, including
Ubuntu's AppArmor default restriction. A maintained local adaptation verifies the
exact upstream checkout and whole `action.yml` hash, removes only the exact
“Enable Linux user namespaces for bubblewrap” step, and verifies the complete
adapted hash. No other upstream bytes change. The reviewed project preflight
provides its exact-executable AppArmor exception instead, preserving global
restrictions and requiring canonical distro `/usr/bin/bwrap` on PATH. Any action
upgrade requires deliberate transformation/hash review; there is no automatic
patching of future upstream versions. See the
[migration automation evidence](../../tests/migration/CI-REPAIR.md).

The adapted pinned action retains `drop-sudo` and the `workspace-write` sandbox. OIDC
request variables are explicitly cleared for that action. Codex receives a
random temporary local gateway credential, rather than the OIDC request token or
an OpenAI access token. Running the credential holder under a different,
protected OS identity helps prevent an agent process from reading its memory or
using sudo to extract credentials.

[openai-wif-proxy.mjs](../../scripts/openai-wif-proxy.mjs) listens only on
loopback and requires that gateway credential. It accepts only
`POST /v1/responses`, only the configured model, and request bodies up to 8 MiB.
Upstream destinations are fixed, redirects are rejected, and the proxy expires
after 25 minutes. These restrictions prevent turning the gateway into an
arbitrary authenticated OpenAI client or a general HTTP forwarding service. The
gateway still permits model requests during its lifetime; the OpenAI project
spend limit is a separate control for that exposure.

Authentication errors emit limited static diagnostics, such as an HTTP status or
the name of a mismatched claim. They do not print token responses, request
bodies, or raw exceptions from the credential holder. The local gateway
credential is masked in Actions output. Provider/account IDs do not need masking
because they cannot authenticate a request on their own.

## The proposal is data

The trusted [prompt](../codex/schema-repair.md) tells Codex to treat upstream
content as evidence and to ignore embedded instructions. It directs the agent to
inspect successful fixtures, use tight types, and report repairs requiring
runtime, test, or fixture changes as blocked. Prompt instructions improve repair
quality; the independent verifier enforces the publication boundary even if the
agent ignores them.

Codex is the last step in its job. Only its structured final JSON crosses into
verification. No patch archive, agent-generated script, candidate Git state,
dependency cache, or runner filesystem is transferred. The proposal is passed as
an environment value and written as data, rather than interpolated as shell
code. This avoids allowing the agent to smuggle commands into the verifier.

[schema-repair.ts](../../scripts/schema-repair.ts) checks exact keys, status,
field types, counts, and a 256 KiB proposal limit. Edits are unique text
replacements in existing regular module source files; traversal, test paths,
schema replacements, added files, symlinks, and unrelated paths are excluded.
The guard parses TypeScript before writing any proposed source.

Its AST checks preserve runtime declarations, imports, interface headers,
existing members, index signatures, shebangs, and reference directives. It
permits typed data properties and plain data interfaces, while rejecting
computed properties, executable type syntax, schema-control JSDoc tags, and
broad shortcuts such as `any`, `unknown`, or empty objects in changed members.
The one allowed alias edit is adding distinct plain strings to an existing
nongeneric string-literal union. Alias names/modifiers and every existing
literal must remain, in order and with their original multiplicity.
New/deleted/renamed aliases, generic parameters, nonliteral members, templates,
type references, and schema-control JSDoc tags are rejected. Existing unrelated
aliases remain unchanged. This permits observed enum growth without allowing
arbitrary type expressions or replacing a precise union with `string`.

This narrow scope keeps automated repairs reviewable and prevents source edits
from introducing executable behavior or bypassing schema validation.

After the AST guard accepts the source changes, trusted tooling regenerates
**every** schema with `--force` in a private complete-source copy, including the
non-module `src/lib/options` consumer. It snapshots all source bytes, rejects
added/deleted paths or non-schema mutations, and refuses any changed schema
outside `src/modules` as manual repair. Only existing permitted module schemas
are copied back. The artifact policy remains module-only; regeneration is never
narrowed to conceal a shared consumer change.

Formatting, lint, full TypeScript checks and the full maintained replay suite
then run before the trusted bundler sees the result. Each stage uses a Linux
mount/network/PID namespace plus inherited AF_INET/AF_INET6 and io_uring seccomp
denial. Host, trusted checkout, candidate Git metadata and fixtures are read-only.
Only candidate `src/modules` during AST apply/restore, and private operator-owned
0700 scratch, can be writable; writable source entries reject hardlink/symlink
aliases. Type/tests use a completely read-only candidate. Guard failures fail
the job, with no native or unguarded retry.

The new launcher establishes an allowlisted environment, disables Bun dotenv
loading and carries no model, OIDC, repository, artifact, proxy or loader
credentials. Git is the fixed system executable with system/global config and
attributes disabled and fixed hook/fsmonitor/external-diff overrides, also for
Git subprocesses of the trusted TS CLI. No agent job Git metadata is reused.
Registry installation is a separate trusted network step. These controls replace
the removed Deno CLI permissions; they do not make the entire runner isolated.
Read-only host files and pathname Unix sockets remain visible, and approved
maintainer base code, tool dependencies and the host remain trusted. Narrow AST
edits cannot add executable declarations, imports or configuration. A compromised
maintainer base, dependency or host is outside this boundary.

Only after those checks pass does the verifier bundle source/schema file
contents, with the exact base SHA and review evidence. The publisher rechecks
paths, regular-file status, interface boundaries, and the resulting diff while
restoring that bundle. It neither installs agent-produced tooling nor runs the
candidate's proposed code. The artifact is from the preceding verifier in the
same run, has a fixed name, and is retained for seven days.

## Publication and release decisions

Repair-stage checkouts use `persist-credentials: false`. The repair and verifier
jobs have read-only repository permissions and no publication token. The
publisher exposes its `GITHUB_TOKEN` to the trusted publication step, uses a
temporary Git HTTP authorization header, and never persists the token in Git
configuration. GitHub write permission is not restricted by file path; keeping
proposed code out of this job's execution is the important boundary.

Publication checks that remote `dev` still equals the recorded drift base. It
leaves an existing repair PR or branch untouched, and its push uses an empty
expected branch value with `--force-with-lease` to create the branch only if it
is still absent. These checks avoid publishing from a stale base or overwriting
another person's work, including a competing branch creation.

The publisher creates `codex/schema-drift-<issue>` and a draft PR against `dev`.
It does not push repairs directly to `dev`, approve or merge PRs, or publish a
package. Ordinary PR CI may require approval for a PR created with
`GITHUB_TOKEN`; independent verification already precedes publication.

The maintainer advice in a PR describes release urgency based on validation
impact. It is an agent-generated recommendation, not release authorization. New
result fields accepted by default validation may wait for a planned release;
strict-validation users can still be affected. A maintainer decides whether and
when to merge the repair and later release it.

## Limits and operational controls

The agent can still propose incorrect semantics, unsupported optionality, or
types that are too permissive while satisfying the syntax guard and cached
tests. Review the successful-response evidence, older/static/fake fixtures, and
generated schemas before merging. Tests demonstrate compatibility with the
checked fixtures; they do not prove correctness for every Yahoo response.

This design does not defend against a compromised maintainer account, malicious
trusted `dev` code, dependency compromise, or a runner/OS sandbox escape. The
root proxy protects credentials from the ordinary agent identity; it does not
provide isolation from a compromised host. Changes to the trusted prompt,
verifier, publisher, dependency pins, or identity mapping deserve explicit
security review because they change these boundaries.

| Control                                  | Effect                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SCHEMA_REPAIR_ENABLED=false`            | Stops automatic repairs; authorized manual `repair_only` dispatches remain available.                      |
| Disable the OpenAI mapping               | Prevents new federated exchanges; do not assume already issued tokens disappear immediately.               |
| `auth_only=true` with `repair_only=true` | Checks federation without invoking the model or running the verifier/publisher.                            |
| `dry_run=true`                           | Suppresses fixture commits/issues and repair branch/PR publication; a repair run can still call the model. |
| Dedicated project spend limit            | Limits model spending independently of the agent's instructions; an alert alone is not a limit.            |
| Workflow concurrency and job timeouts    | Serialize recache/repair runs and bound each job's lifetime.                                               |

Inspect sanitized Actions diagnostics for configuration failures. If suspicious
behavior appears, disable automatic repair and the OpenAI mapping, cancel active
runs, and review generated branches, PRs, and model usage before re-enabling.
Never paste credentials into issues or debugging logs.
