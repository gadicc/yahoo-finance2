# Biome and editor tooling (K01/K04 adoption)

This milestone adopts **Biome 2.5.15** for maintained JavaScript, TypeScript,
JSON and JSONC. The exact root development dependency and command aliases are
installed. The source survey is deliberately recorded before formatting or lint
repairs; its checks remain red. K01/K04 are accepted on the evidence below;
K02 cleanup remains open. No Deno formatter, linter, language server or development
process is required by this policy.

## Commands and scope

The exact root development dependency is `@biomejs/biome: 2.5.15`. Use:

```sh
bun run format       # biome format --write .
bun run format:check # biome format .
bun run lint         # biome lint .
```

Formatting only changes layout. Lint runs without `--write`; warnings remain
visible and errors fail. For a focused warning-sensitive check, run
`bun run biome lint --error-on-warnings path/to/file.ts`. Never apply
unsafe fixes as an unattended migration step. `biome check --write` also applies
safe lint fixes, so it is not the repository's formatting command. Formatting
churn must land separately from runtime changes after the active source reviews.

`biome.json` retains every rule in the pinned recommended preset, with its
upstream severity. There are no per-file rule disables or blanket suppressions
in this initial configuration. The spelling `preset: recommended` replaces the
now-deprecated `recommended: true` without changing the selected preset.

| Existing concern | Biome coverage and initial policy |
| --- | --- |
| Explicit `any` suppressions | `suspicious/noExplicitAny` warns. Existing Deno comments do not suppress Biome; K02 must replace or justify each occurrence with a specific reason. |
| ANSI control-code regular expression | `suspicious/noControlCharactersInRegex` errors. Keep the deliberate stripping behavior and replace its existing Deno suppression narrowly in K02. |
| Implicit `let` types, assignment expressions, loose equality, unsafe `finally` | Recommended error rules remain enabled. Resolve or narrowly justify the observed cases with focused verification. |
| Unused imports and variables | Recommended diagnostics remain enabled; formatting does not remove either. |
| Non-null assertions and `@ts-ignore` | Recommended warnings remain visible. Do not replace assertions with casts or blindly change generator-specific suppressions to `@ts-expect-error`: schema tooling uses TypeScript 5.9 while project checks use 6.0. |
| Literal template text, template preferences and optional chaining | Retain the recommended warning/information diagnostics. Release commands containing literal `${...}` need specific explanations, not automatic interpolation. |

This is a reviewed starting policy, not a claim of one-to-one coverage of every
Deno lint rule. TypeScript's independent semantic checks remain mandatory.
Representative negative controls prove that malformed formatting, unused
imports, explicit `any`, unsafe `finally` and loose equality remain detectable.

The formatter uses two spaces, LF, 80 columns, double quotes, semicolons and
trailing commas in JavaScript/TypeScript; JSON gets no trailing commas. It reads
`.editorconfig`. All assist actions, including import organization, are disabled
for this phase, preserving import order and attached comments. Root maintained
manifests, configs, `.vscode`, `scripts`, `src`, test helpers and the independent
Workers harness source remain in scope. Historical experiment TypeScript/config
files are not excluded merely to obtain a passing result; their commands are
still historical, as the tracker explains.

The scope excludes dependencies, generated `npm`, schemas, HTTP fixtures,
`tests/http`, coverage, generated API/docs output, private migration output,
plans, agent metadata and immutable `tests/migration/results` receipts. Root
Bun/Deno locks and the separate Workers npm lock retain their owning tools'
serialization. Git ignore rules are also respected. A maintained source file
must not be excluded to hide lint or formatting debt.

Biome 2.5 does not format Markdown or YAML. These remain manually reviewed under
`.editorconfig` and existing repository style; there is no replacement tool or
claim of automated coverage for prose or workflow YAML. Other unsupported file
types are skipped by `files.ignoreUnknown`, which does not suppress parse errors
in supported maintained files. See the upstream [language support matrix](https://biomejs.dev/introduction/language-support/).

## Workspace editor behavior

Install the recommended `biomejs.biome` extension and use VSCode's built-in
TypeScript extension. Workspace settings disable Deno, restore JavaScript and
TypeScript diagnostics, and point at `node_modules/typescript/lib` from the
exact root dependency. Accept **Use Workspace Version** if VSCode prompts;
`typescript.tsdk` makes that version available but cannot silently change a
user's saved version selection. Automatic type acquisition remains off.

TypeScript's `importModuleSpecifierEnding: js` preference means explicit
extensions. With this project's `allowImportingTsExtensions`, TypeScript 6
chooses `.ts` for local TypeScript auto-imports, including a new file with no
existing imports. An actual TSserver completion/code-action control verifies
that behavior. Retain `.ts` imports manually as well; a generated package's `.js`
consumer imports follow its independent build contract.

Formatting on save is scoped to TS/TSX/JS/JSX/JSON/JSONC and uses the project's
Biome configuration. Other languages receive no workspace Biome formatter.
Fix-all and import-organization save actions are explicitly disabled. Generated
schemas and fixtures remain outside Biome's configuration scope even when open
in the editor. No global formatter, extension or model setting is modified.

The `schema watch` process task preserves the existing folder-open intent and
runs `bun run schema --watch` from `${workspaceFolder}`. VSCode may require
workspace trust and permission to run automatic tasks; users can also start the
same task manually. Bun 1.4.3 must be on the editor process's `PATH`, with root
dependencies installed. The task uses a TypeScript diagnostic pattern that strips the generator
root prefix, and background readiness patterns matching the generator's
actual per-scan start, successful-scan and failed-scan messages. Every scheduled
batch emits `Schema scan started.`, including scans after an error or source
repair. Each start has its own completion marker, so the background matcher can
reset problems and readiness for every batch. A failed scan remains a live
watcher, allowing a source repair to recover. Cancellation stops the task
process group and its watcher; restart after editing generator executable code.

Headless controls exercise the actual pinned TSserver protocol, Biome LSP
formatting/configuration/exclusions and the exact task command in a disposable
mirror. They verify ready/error-ready matching, failed-scan schema preservation,
source-edit recovery, and SIGINT/SIGTERM cleanup. They do not claim a VSCode GUI
save, extension installation, automatic-task permission, or other-platform run
was observed. The historical preparation mirror reused the installed graph.
The adoption mirror is freshly installed from `aaf3ef1` plus only the authorized
adoption files; concurrent runtime drafts are excluded. TSserver/Biome LSP
preparation proofs are reused because their configurations and relevant source
inputs are byte-identical. The changed watcher receives new focused tests and
actual task/matcher cycle proofs.

## Dependency and acceptance boundaries

The package is MIT OR Apache-2.0, declares Node >=14.21.3 and selects an exact
optional native platform package. Eight targets cover Windows/macOS/Linux,
x64/arm64 and glibc/musl; only Linux x64 is exercised here. The inspected wrapper
and installed Linux packages declare no lifecycle scripts. Registry installation
is a separate network-authorized operation from guarded offline verification.
The lock adds exactly nine Biome entries and changes/removes no existing entry;
all other direct pins and script values are preserved. The fresh normal-hook
frozen install reports 444 packages, while recursive inventory including bundled
packages finds 614 physical manifests and 567 distinct name/version pairs. These
are different measurements. All three installed Biome packages match every
regular file in the official, SHA512-verified archives; the eight target lock
integrities match registry metadata. Script traces select the installed Linux
x64 glibc binary. The musl package is installed but not executed.

The clean graph declares no dependency installation hooks and reports zero
untrusted script packages; the root preinstall toolchain hook runs normally.
Node 24.21.0 satisfies all 467 declared Node engine ranges. License metadata is
present, including the existing legacy `licenses` declaration on
`qrcode-terminal`. Registry audits of both the lock graph and actual installed
graph retain the two existing `braces` and `sprintf-js` advisories described in
[the dependency audit](DEPENDENCY-AUDIT.md); Biome adds no reported advisory.
There is no advisory-clean or other-platform claim.

The adoption receipt records the fresh installation, actual root-script
selection, supported/excluded-file controls, red baseline and exact hashes.
Independent Sol xhigh and Astra xhigh reviews cleared K01/K04, reproducing
the pinned aliases, scope controls, nine schema tests, headless TSserver/Biome
LSP behavior and repeated watcher recovery/shutdown. Source lint repairs and formatting churn must land as
separate reviewed steps; this milestone does not claim their checks pass. K02
additionally owns directive migration and CI/local command alignment. See the upstream
[configuration reference](https://biomejs.dev/reference/configuration/),
[VSCode settings](https://biomejs.dev/reference/vscode/) and
[CLI command distinctions](https://biomejs.dev/reference/cli/).

The parent review identified that the preparation task's start matcher only
matched process startup, leaving later batches without a new matcher cycle.
The adoption fixes that with one watch-only per-batch log and an initial, failed,
repaired scan regression. Generation bytes and non-watch behavior remain
unchanged. The immutable preparation receipt stays historical and is superseded
for watcher-cycle readiness by [adoption evidence](results/k01-k04-adoption.json).
