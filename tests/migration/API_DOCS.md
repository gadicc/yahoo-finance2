# API documentation tooling

K05 replaces contributor documentation generation with pinned TypeDoc 0.28.20
and typedoc-plugin-missing-exports 4.1.4. Select the repository's Bun 1.4.3 and
install its frozen graph first. Deno remains a supported consumer and publisher
runtime; these contributor commands do not invoke it.

```sh
bun run docs:gen
bun run docs:lint
bun run docs:watch
bun run docs:open
```

`gen` publishes HTML to `jsdocs/`. `lint` converts, renders and validates in a
temporary directory, then removes it; it does not publish output. Rendering is
necessary to catch rendering-time link warnings. `watch` polls actual source and
tooling input contents every 300 ms, serializes builds, retains the last successful
output after an invalid edit, and retries after another input change. Missing or
unreadable configuration inputs remain visible errors while polling continues;
unchanged errors are logged once, and restoring even identical bytes retries the
build. No missing input is replaced with a fabricated value. The input closure is described below. It does not read the prose `docs/` tree or
README into the API site. `open` explicitly starts the platform opener for a completed owned
output; it does not generate documentation. No command checks external links over
the network.

`gen`, `watch` and `open` accept `--out-dir /absolute/path`. Its parent must exist
and be canonical. Custom output must be outside the checkout and cannot be an
ancestor of it. A new or empty directory can be used; replacing nonempty output
requires this tool's exact `.yahoo-finance2-docs.json` marker. Unmarked former
output, symlinks, hardlinks and special files are refused. Move old documentation
aside explicitly instead of silently adopting it. Only `jsdocs/` is permitted
inside the repository. `lint` always uses temporary output; an output argument
has no publishing effect.

Generation uses sibling staging and an exclusive `OUTPUT.lock` directory. Only a
successful conversion, warning gate and unchanged-input check replaces existing
output. Ordinary failures and SIGINT/SIGTERM remove staging and the lock; the
launcher waits for its worker and escalates termination after two seconds. A
SIGKILL or machine crash may leave a lock or `.yf-docs-*` staging directory. Inspect
it and ensure no writer remains before moving it aside manually. If publication
and backup restoration both fail, the error names `OUTPUT.lock/previous`, which
retains the previous successful docs. Cleanup, including repeated cleanup, leaves
that backup and lock intact; a new writer refuses the lock until manual recovery.
This ownership protocol protects trusted developer output; it is not a sandbox against concurrent
hostile filesystem mutation.

The opener uses argv without a shell: `xdg-open` on Linux, `open` on macOS and
`rundll32.exe url.dll,FileProtocolHandler` on Windows. Its launcher is bounded to
five seconds. Linux headless argv and lifecycle controls are verified; no GUI was
opened during acceptance. Actual macOS/Windows execution remains unverified here,
and no portable process sandbox is claimed. Offline acceptance runs use the
existing Linux guard separately from these trusted contributor commands.

## Export and link coverage

`deno.json` is the entrypoint authority. All 28 public keys map to 27 unique source
modules, including `.` and `./src/index.ts` as explicit aliases of the same module.
Each key must have a reflection and rendered HTML page. Output includes:

- `reflections.json`: TypeDoc's serialized reflection model.
- `documentation-report.json`: every export key/source/module ID/URL, normalized
  Deno links and actual rendered href checks, reflection counts and diagnostics.
- `diagnostic-delta.json`: new/increased diagnostics and resolved existing debt.

Existing Deno comment syntax is normalized in memory, after conversion, against
actual exported module reflections. Recognized `[module/path]` and
`[module/path].Member` targets preserve their labels and `@linkcode`; named default
functions resolve only when the source's actual default declaration has that
name. The existing `../../~/default.html | default` form resolves to the root's
actual default reflection. Unknown modules/members fail. Ordinary TypeDoc links
keep TypeDoc's validation. Public source comments and JSR signatures are unchanged.

All 95 original Deno-style link occurrences render with verified hrefs and target
files/anchors. Missing-export conversion adds 66 copies in anonymous internal type
reflections. Those targets resolve in JSON; their owners have no HTML URL, so the
report marks them `rendered:false` rather than counting them as rendered links.

The missing-exports plugin exposes referenced local types such as the factory's
`CreateYahooFinanceOptions`. Its pinned resolve-begin hook is bounded by enabling
external exclusion only for that expansion pass, at a priority above the plugin's
1e9 hook; ordinary conversion retains inherited public members. An invariant
rejects dependency-source declarations under `<internal>`. Each build uses a fresh
worker because the plugin patches TypeDoc's Context once per process. A dependency
upgrade must review this lifecycle adaptation and the serialized graph. Globally
enabling `excludeExternals` was rejected because it dropped 23 of the cookie jar's
25 public members; the accepted model retains all 25.

Inherited tough-cookie links point to 13 exact upstream symbol pages for the
installed v6.0.2. These are external dependency documentation, not new project
exports. Dependency source references do not receive false links into this
repository's `node_modules/`. Project source hyperlinks use an exact verified
Git commit and the correct `src/` path, with no branch-name or `dev` fallback.
Both `@yf-schema` and `@discriminator` are recognized custom block tags;
source/schema semantics and generated schemas are unchanged.


## Source provenance

The report records `sourceProvenance` and the full documentation
`inputFingerprint`. A source URL is emitted only when the intended root has Git
checkout metadata, its origin identifies this repository through a recognized
HTTPS or SSH URL, and every actual `src/` file and its inventory match Git blobs
at the exact observed HEAD commit. This compares bytes directly, without trusting
index/stat flags such as assume-unchanged. Read-only Git commands explicitly use
`--no-replace-objects`, so local replacement refs cannot relabel replacement bytes
with an original commit URL. The check ignores inherited `GIT_*`
repository overrides, disables optional locks/fsmonitor, uses bounded shell-free
read-only Git calls, and invokes no hooks, fetches or remote checks. Missing Git,
archives, unknown origins, extra/deleted files and uncommitted source produce
explicit omitted provenance and retain source positions without hyperlinks.

The source commit identifies source bytes, not uncommitted documentation tooling.
The input fingerprint separately binds the actual tooling, configuration, export
metadata and source contents, plus source provenance. Workers and the launcher
recheck those inputs before publication. Moving HEAD during generation invalidates
the build even if source bytes remain the same. Links to dependencies stay with
the verified versioned external-symbol mapping; they do not use our commit URL.
Remote availability of the observed commit is not checked offline: push a commit
before publishing linked documentation. Unusual checkout transformations such as
line-ending conversion conservatively omit hyperlinks when bytes differ.

Actual controls generate from a committed contributor branch whose line positions
differ from `dev`, then verify all own-source references and a rendered `src/`
href contain the exact observed commit and expected line. Separate archive and
masked dirty-source builds have no source hyperlinks. A HEAD-only change during
an actual build fails publication and preserves the previous output. The rollback
control injects both rename failures, checks the backup after repeated cleanup,
and verifies a new writer refuses the recovery lock.

## Compiler and configuration input closure

The fingerprint includes the actual library compiler program, including selected
`bin/` files and declaration files, resolved compiler configuration, optional
`tsdoc.json` and its resolved parents, project package metadata used in type
resolution, export metadata and documentation tooling. It records a serialized
input inventory in `documentation-report.json`. Adding or removing optional
configuration, a previously missing resolution candidate or a directory discovered
for wildcard type roots invalidates the cached program.

Supported compiler and TSDoc `extends` entries are explicit repository-local
JSON/JSONC paths that Node and TypeScript resolve to the same file. Package,
ambiguous or outside-checkout configuration paths, symlinked project inputs and
compiler project references fail with an actionable error. Valid inherited
`typedocOptions` overrides are rejected: this tool owns its conversion options in
`scripts/docs/model.ts`. Unknown options still retain TypeDoc's native startup
diagnostics. Additional includes/media files must already belong to the tracked
input inventory or the frozen installed dependency graph; untracked render inputs
are rejected. Dependency/theme bytes and TypeScript standard libraries use the
ordinary trusted frozen-install assumption. Restart watch after reinstalling or
manually changing installed dependencies.

The launcher passes its expected fingerprint to the worker. The worker discovers
and checks its own snapshot, compares the actual pinned TypeDoc program's compiler
options, root files and source text against that snapshot, then converts those
same program objects. Both worker and launcher recheck before publication.
Warm polls parse configuration and hash tracked mutable project files and lookup
presence; they reuse the program only while all recorded inputs agree. A changed
closure recreates the program. Polling waits 300 ms between checks and never runs
concurrent builds.

A Linux committed-checkout measurement with 58 roots, 374 program sources and 107
tracked lookups took 326 ms cold and a mean 19 ms per warm check across 20 samples.
The six-second warm window used 613 ms of parent CPU; the complete 6.88-second
measurement, including cold work and waited Git children, used 2.16 CPU seconds.
These are local measurements, not a cross-platform performance guarantee.

Conversion failures print normalized compiler code, relative file, line and
message before aborting. Output is bounded to 20 errors, 1,600 characters per
error and 16,000 total characters, with an omitted-count notice. It does not dump
the existing missing-documentation warnings. Actual controls change a selected
`bin/` file, inherited compiler settings and resolved TSDoc parents, observe
failed generation with unchanged previous output, restore inputs and recover.
They also reject mutation during generation. The actual watch command recovers
when only optional TSDoc configuration is removed, without an unrelated source
edit. Bun and Node produce identical HTML, reflection and input-inventory bytes.

## Existing documentation debt

All validation classes remain enabled. TypeDoc bootstrap errors and warnings
are rejected before replacing its startup logger with the conversion collector.
The original startup diagnostic stays visible; configuration errors are never
waived through the documentation-debt baseline. The reviewed missing-documentation baseline
contains 2,269 diagnostics on our own reachable source declarations. It includes
local types referenced by the public API; it does not waive dependency/Node graph
warnings. The exact diagnostic multiset preserves symbol names, relative source
identity and counts, stripping only checkout location artifacts. New or increased
warnings fail; resolved debt is reported. Baseline changes require deliberate
review, with no automatic refresh command. Do not invent financial descriptions to
silence existing gaps.

Two insights parser diagnostics are tracked separately in
`scripts/docs/parser-compatibility.json`. TypeDoc retains the first `@remarks` and
omits a second paragraph that repeats its availability and premium-subscription
caveats. The retained paragraph also includes fuller coverage and timeliness text;
all are verified in HTML. The emitted duplicate-`@returns` warning is an upstream
0.28.20 parser condition using the duplicate-remarks count; that module comment
has no returns block. The actual unvalidated-overload returns text is retained.
The receipt records exact normalized retained/omitted spans. No distinct JSDoc
meaning is lost here, and no source text was rewritten.

Additional controls use real Git replacement refs, then verify both rejection of
replacement bytes and acceptance of matching original-commit bytes. The actual
watch command survives package.json removal, deduplicates repeated errors, rebuilds
after identical configuration restoration and a later source edit, and aborts
cleanly during another missing-input interval. A real invalid TypeDoc startup
option fails visibly and preserves every prior generated output hash; restoring
configuration regenerates the same output.

Acceptance adds a new undocumented exported interface, removes a real public
function comment, introduces an ordinary unresolved link and introduces an unknown
Deno-style module link independently. Each fails and preserves the previous output.
It also covers real watch recovery/signals and child cleanup. TypeScript 6.0.3 and
Node 24.21.0/Bun 1.4.3 on Linux are verified. Generated HTML/reflection bytes agree
between those runtimes; three compressed search/navigation/hierarchy assets have
different deflate bytes but identical inflated payloads. This is not actual Deno,
macOS or Windows runtime proof.

See [the receipt](./results/k05-api-docs.json) for the exact base, dependency
provenance, graph/audit delta and evidence hashes. Public source, signatures,
exports, schemas and fixtures remain byte-identical to the committed base.
