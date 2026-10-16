# Isolated publisher preparation

This directory owns JSR staging and explicit nonpublishing publisher rehearsals.
Ordinary Bun tests, checking, generation and builds do not execute Deno. The
[release workflow](../../.github/workflows/release.yaml) uses the Bun build and
Node controller described in the [release guide](../../docs/RELEASING.md). Deno
runs only inside this isolated publisher boundary; the root manifest stays private.

Use the private root's frozen Bun graph and Node 24.21.0 for the publisher
controller. Pure analysis is separate:

```sh
node scripts/publisher/check-policy.mjs
```

It exercises the real pinned analyzer, conventionalcommits writer and
semantic-release version/channel functions with synthetic breaking and fix
commits, including main-only, master-only and both-present stable branch sets.
It creates no Git refs, tags, releases or registry requests. Versions
in this fixture are examples, not an instruction to publish them. Existing
release branches and channels stay in `release.config.mjs`.

A rehearsal is explicitly selected and always writes a new outside directory:

```sh
node scripts/publisher/rehearse.mjs --publisher-rehearsal \
  --results /absolute/new-publisher-results --version 9.8.7-next.1 \
  --bun /absolute/pinned-bun-1.4.3 \
  --minimum-deno /absolute/checksum-verified-deno-2.0.0
```

`--minimum-deno` selects actual minimum-consumer verification inside this
publisher process. Without it, no Deno 2.0 compatibility acceptance is claimed.
The source and real tarball-installed npm consumers use separate graphs and
record their type and runtime failures independently; overall verification
fails if either fails. Their runtime probes reject ordinary fetch, inject one
controlled quote response and deny network permission. Registry acquisition of
packages/types precedes those runtime probes. The manual npm consumer's Node
ambient verification package uses the authoritative root `@types/node` pin.
It does not introduce a second root dependency graph or change public engines.

The stage preserves original source paths, Git HEAD and repository origin in a
private no-hardlink clone. Only the regular public source/schema/data closure,
LICENSE, README and generated minimal `deno.json` are publishable. No root
`package.json`, development tasks/permissions, tests, scripts, fixtures, Git
metadata, caches, lockfile or dependency directory is in its explicit file
allowlist. Type-only aliases and import-adjacent Deno type hints are resolved
through the same exact runtime pins in the authoritative root manifest/lock.
Only validated import-adjacent `@deno-types` comments are supported. Export hints,
other hint positions/forms and triple-slash reference directives are refused
before following import targets. Checks inspect actual lexical comments;
directive-looking strings, templates and regular expressions remain ordinary
source. Valid hints may name only the matching runtime subpath or its
extensionless type subpath; external/file URLs, unapproved packages, version
overrides, divergent subpaths, malformed directives and duplicate hints fail
before resolution.
Source files must match the stated Git commit before and after copying. Version
preparation changes the stage metadata and generated npm metadata together;
root `package.json`, `bun.lock` and `deno.json` stay unchanged.

Pinned `semantic-release-jsr` 4.0.2 resolves through pinned JSR CLI 0.14.3,
whose release downloader verifies its embedded archive hash for Deno 2.6.7.
The real initial JSR dry-run performs full source/type/slow-type checks with
`pkgJsonPath=null`. No Node compatibility `--no-check`, slow-type exemption,
provenance opt-out, auth token or fake OIDC context is used. This pinned Deno
publish command has no CLI frozen-lock flag. Publisher-only cache acquisition
creates an auxiliary v5 lock, then the stage config sets `lock.frozen=true`.
Actual subsequent dry-run and publish routing retain that lock, and the
rehearsal checks that deleting a direct lock specifier fails verification.
This private lock is generated/hashed, excluded from publication, and never
replaces or modifies authoritative root `bun.lock`. It does not depend on a
root Deno lock. The root Bun lock is the development graph; the private publisher
lock is auxiliary. Deno 2.0 consumer verification uses its own compatible
graph/lock format.

The JSR wrapper preserves native GitHub Actions OIDC/provenance behavior and
requires the source commit to match `GITHUB_SHA` on a real Actions publisher.
Pinned Deno's provenance predicate derives repository/workflow/ref/SHA from
real GitHub environment variables; staging does not replace them. Its publish
config remains at repository-root-relative `deno.json`, and source paths retain
the original `src/` layout. A local dry-run validates files/types and does not
generate, attest or prove a real provenance statement. Package/repository
linkage, actual npm/JSR OIDC authorization and attestation acceptance require a
separately authorized real release. Neither a local rehearsal nor its Git source
checks establishes GitHub provenance, a distribution ref/tag or publication.

Consumer floors and the new-major upgrade are defined in the
[upgrade guide](../../docs/UPGRADING.md#next-major-bun-development-and-consumer-floor)
and [runtime policy](../../tests/migration/RUNTIMES.md). A passing publisher
fast/slow-type check does not prove a consumer with a different node_modules mode
typechecks. Keep source and installed-consumer observations, exact runtime/mode
records and negative controls distinct.

The bounded rehearsal currently runs on Linux with Python, Bubblewrap and
libseccomp. Artifact installation uses normal hooks in a fresh consumer with
root-derived exact direct runtime pins; it precedes guarded Node/Bun consumer
checks. Those checks exercise all 28 ESM/CommonJS exports, real consumer
declarations and all three installed bin version paths with a synthetic version.
This does not invoke semantic-release's real publish lifecycle. A root-derived
pin in a consumer verification graph does not change the published package's
existing semver dependency ranges.

Pinned JSR launches its downloaded binary with a shell. This wrapper refuses a
temporary download directory containing spaces or shell metacharacters instead
of accepting that upstream boundary; the stage and checkout cwd may contain
spaces because cwd is passed separately. No global temp setting is changed.

Within this explicit publisher command, real Deno 2.0 and pinned publisher Deno
2.6.7 observations directly assert the internal runtime detector and support
check choose Deno with the exact version despite real Node compatibility
globals. Actual pipes produce terminal=false; a bounded publisher-owned Linux
stdout PTY produces terminal=true. Both use cached-only execution, deny network
permission and reject ordinary fetch. This is a Linux stdout observation,
including receiver behavior; it does not claim native Windows terminal,
interactive keyboard or GUI behavior. The controller records exact commands,
runtime binary hashes and output in its new result directory.

Acceptance requires the complete version/minimum-consumer rehearsal on the
accepted composed source head. Earlier private-overlay/source-type failures and
subsequent narrow source-binding, npm-configuration and type-hint proofs remain
dated evidence in their immutable receipts. They do not replace that final
combined rehearsal or prove real registry authorization. Use the
[partial-release inventory and recovery guide](../../docs/RELEASING.md#partial-publication-and-recovery)
before considering any separately authorized remote repair.

The maintained rehearsal always checks standalone source and real installed npm
ESM consumers on pinned publisher Deno 2.6.7; `--minimum-deno` adds exact Deno
2.0.0. Each passing positive is paired with the same complete consumer plus one
invalid numeric `registerTool` name, using the identical config/import map and
installed graph. The negative is typechecked and never executed. It must exit
normally with code 1, report only TS2345 number-to-string, print the intended
call and name its exact file/line/column. An unresolved import, arbitrary error,
wrong location or unchecked success fails the rehearsal. Both runtimes also run
the passing consumer with cached-only network denial and rejecting ordinary
fetch. These are Deno ESM declaration controls, not a Deno CommonJS claim.
The source-hint-only false green and rejected declaration-hint attempts remain
in the separate SDK receipt; a positive-only type check is insufficient evidence.

Git source binding compares raw worktree bytes with original HEAD objects using
`hash-object --no-filters`; autocrlf or clean-filter output cannot substitute for
the bytes actually copied. Both pre-copy and post-copy comparisons use this
rule. Every provenance Git operation, including the no-checkout local clone,
ignores replacement objects and inherited `GIT_*` repository/config/replacement
overrides. Read operations disable optional locks and fsmonitor hooks. Private
controls prove CRLF and custom-filter code substitutions are refused without
executing the configured filter, and that an inherited replacement namespace
using a cloned SHA-named tag cannot relabel replacement source as original HEAD.
Original matching bytes still pass with those local filters/replacements present.
The controls create objects/refs only in disposable test clones, never in the
source checkout or remote repository.

Rehearsals clear every case-insensitive `npm_config_*` variable and authentication
channels before binding npm's user and global configuration to distinct private
empty files. Pack and registry acquisition pass those same paths explicitly.
The pinned npm 11 global-config CLI option alone does not override a conflicting
environment value, so sanitation and the private global environment binding are
both required. Offline fake-token controls inspect the actual pinned npm config
loader and prove ambient global/user credentials are absent. This isolation is
specific to the nonpublishing rehearsal; actual publisher OIDC hooks are unchanged.

Type-hint classification rejects case aliases at import and export boundaries,
including Unicode simple case folding (`/iu`). Canonical lowercase ASCII
`@deno-types` remains the only accepted import hint, with the approved matching
runtime/type subpath. Unsupported export hints, same-comment/duplicate hints,
external declarations and alternate marker spellings fail before resolution.
Directive-looking strings, templates and regular expressions remain ordinary
source. Maintained controls enumerate the ASCII/Unicode marker variants and
include U+017F LATIN SMALL LETTER LONG S (`ſ`); explicit publisher controls cover
actual Deno 2.0.0/2.6.7 no-hint failures and external-only declaration mutation.
These synthetic controls do not claim a previously published package had a defect.

The hint-hardening evidence includes a fresh real production JSR dry-run with the
same source closure/import map. It reuses the prior full consumer/install/lock
proof for that narrow change and does not claim a fresh full registry-consumer
rehearsal. Record each result's exact source and scope. The final accepted-head
rehearsal and real release/provenance gates remain separate.

V7 refuses the contiguous `<reference` marker in any actual lexical comment,
using Unicode-aware case-insensitive matching. This deliberately conservative
policy does not mirror Deno/Rust whitespace, comment prefixes, attributes or
comment kinds. Both pinned Deno graph grammars require that literal marker:
[0.83.3](https://github.com/denoland/deno_graph/blob/0.83.3/src/ast.rs#L47) and
[0.106.0](https://github.com/denoland/deno_graph/blob/0.106.0/src/analysis.rs#L403).
Harmless reference examples and JSDoc generics containing it are unsupported
comments too; use ordinary prose instead. Ordinary triple-slash explanations
remain supported, including all three existing production comments. Literal
strings, templates and regular expressions remain unaffected.

Maintained controls cover all 25 Unicode White_Space characters across separator
positions and path/types/lib attributes in line/block layouts. Line terminators
end line comments, so the four prefix line-terminator cases use block coverage
rather than claiming a line directive exists. The actual publisher-only matrix
checks both Deno 2.0.0 and 2.6.7 across all 25 prefix whitespace characters for
path/types and three ignored block controls. NEL U+0085 previously escaped the
JavaScript whitespace check: changing an external declaration changed Deno's
type result while v6 verification passed. V7 refuses that reference-bearing
comment before following its target. Ignored block comments are refused as a
conservative policy, without claiming they were Deno dependencies. A fresh
production JSR dry-run and unchanged closure/map checks preserve valid SDK
hints, Git/npm/OIDC boundaries and the separate final composed rehearsal gate.
