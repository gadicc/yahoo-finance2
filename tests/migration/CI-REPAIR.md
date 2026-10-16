# Recache and schema-repair CI migration

The workflow keeps its existing daily `37 3 * * *` schedule, explicit manual
inputs, `dev` policy, non-cancelling concurrency and separate repository write
jobs. This change does not authorize a live run. Recache still runs a complete
strict cached baseline before the maintained broker-backed command, now
`FETCH_DEVEL=recache bun --no-env-file scripts/recache-tests.ts --live`. Both
opt-ins are required. Its existing serial pacing, real 429 latch, private capture
staging and original-byte validation remain authoritative.

The workflow validates logs and captures through the strict no-network boundary
before staging and again afterward. Checked, NUL-delimited Git status and raw
staged inventories disable rename folding and inspect every changed path. Only
ordinary JSON additions and modifications with regular Git mode `100644` are
allowed. Deletions, reported renames/copies, type or mode changes, conflicts,
static, fake and geographic fixtures, and nested or unrelated paths stop before
staging or publication. A move cannot hide its deleted source behind an ordinary
destination. Failed Git commands fail the step instead of producing an empty
inventory. The inspected and staging path sets must match, and staged paths and
bytes must equal the validated working snapshot.

This is a snapshot policy. A valid ordinary addition may have bytes identical to
an unchanged existing fixture; Git snapshots do not establish filesystem copy
intent. Content and rate-limit validation still applies to every accepted file.
A 429 or other validator failure stops before commit/push. Earlier private
captured bytes are not rolled back or silently accepted. Dry-run simulation still
suppresses publication and skips protected fixture classes.

Repair uses a fresh pinned trusted graph in each job and no candidate install.
The candidate is a fixed sibling of the trusted checkout, avoiding compiler
ancestor searches into its separate graph. Candidate dependencies are a real
private copy of the trusted graph, verified byte for
byte with internal relative links and no shared writable inodes. Borrowed SDK
links cannot bypass the package builder's existing own-input checks.
`ci_repair.py` checks the exact executable/config closure, recorded fixture-only
commit ancestry and fixture equality before creating its candidate. Legacy
Deno-only bases fail with a compatible-base diagnostic. Candidate module types
remain subject to the existing unchanged `schema-repair.ts` AST/index/path
policy. The verifier regenerates all schema consumers in private scratch and
refuses non-module output drift before copying any module schemas. Guarded
formatting, lint, full types and full replay precede the verified data bundle.
The fresh publisher restores only that artifact using trusted AST code before
its existing absent-branch/fresh-dev/draft-PR checks. It never evaluates proposed
module source or candidate hooks.

The guard keeps host, fixtures, candidate Git metadata and trusted scripts
read-only, closes inherited descriptors, isolates network/PID namespaces, and
uses the existing inherited IP/io_uring seccomp filter. The only candidate write
mount is `src/modules` during AST apply/restore; full generation writes solely
into private scratch and trusted promotion copies only existing module schemas.
Type/tests have no candidate write mount. The allowlisted environment excludes
credentials, loader hooks and inherited capture controls; Bun dotenv loading is
disabled. Git uses fixed hook/fsmonitor/config/attribute overrides. These are
effective runtime controls, with the same trusted-base/dependency/host and
pathname Unix-socket limitations as maintained Linux replay. They do not claim
complete Deno permission parity or arbitrary hostile-code isolation.

## Pinned Codex action adaptation

The upstream action at `bdf19a4a223ec2549a3e2274a0cf61556bc07675` contains a
hosted-Linux step that disables the global AppArmor userns restriction. The
workflow checks out that exact official commit outside the candidate, requires a
clean checkout and original `action.yml` SHA-256
`448852e9e59565440bf25174b54bbf661bd66102be295af2e526fa09eaaf3bd7`, and
removes only “Enable Linux user namespaces for bubblewrap”. The adapted SHA-256
must be
`766147ff38ef6eedcc8f934193b52f00784afbf8db703eb609962e55af0c5e0c`.
All other action files and steps, including credential proxy, irreversible
sudo/socket restrictions, no_new_privs and capability handling, remain unchanged.
The project’s reviewed per-executable AppArmor preflight replaces that one
removed step; canonical distro `/usr/bin/bwrap` must be selected on PATH.
An upstream upgrade requires a new deliberate review of both hashes and the
single-step diff. There is no general upstream patch mechanism.

## Verification and limits

The [receipt](results/i05-i06-ci-repair.json) binds the exact candidate, synthetic
controls and local guarded proofs. Fixtures used for drift and restore proofs
are disposable copies, never the real fixture tree. No workflow dispatch,
network recache, federation exchange, model request, issue, PR, push or package
publication is part of verification. Actual hosted recache/repair/authentication
and publication remain unexercised until separately authorized; static workflow
checks and local Linux controls do not establish them.

Primary references checked 2026-10-16:
[pinned Codex action source](https://github.com/openai/codex-action/tree/bdf19a4a223ec2549a3e2274a0cf61556bc07675),
[setup-bun version-file input](https://github.com/oven-sh/setup-bun),
[Bun environment and dotenv controls](https://bun.com/docs/runtime/environment-variables),
[Git environment controls](https://git-scm.com/docs/git),
[Git configuration precedence and hooks](https://git-scm.com/docs/git-config),
[Git raw NUL inventories and rename controls](https://git-scm.com/docs/git-diff),
[Git porcelain status](https://git-scm.com/docs/git-status),
[AppArmor CI scope](CI-APPARMOR.md).
