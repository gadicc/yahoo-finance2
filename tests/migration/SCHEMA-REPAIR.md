# Portable schema-repair CLI

The trusted verifier uses Node filesystem/process APIs and the installed
`ts-json-schema-generator` parser. It runs with Bun 1.4.3; direct source
execution is also verified with Node 24.21.0. It does not invoke Deno, fetch
Yahoo responses, generate schemas, or evaluate proposed source. Schema generation
and replay verification remain separate required steps before accepting a real
repair. The CI workflow port remains I06.

Run from the target Git repository's root. Supply a full 40-character commit
SHA and keep handoff files outside that repository so they do not introduce
untracked working-tree changes:

```sh
bun /absolute/path/to/scripts/schema-repair.ts apply BASE_SHA /tmp/proposal.json
bun /absolute/path/to/scripts/schema-repair.ts bundle BASE_SHA /tmp/proposal.json /tmp/bundle.json
bun /absolute/path/to/scripts/schema-repair.ts restore BASE_SHA /tmp/bundle.json
```

All successful commands exit 0; invalid input or operational failure exits 1.
`apply` prints the existing JSON readiness/summary/evidence receipt, including
`ready: false` for a valid blocked proposal. `bundle` and `restore` are quiet
on success. Unknown commands, extra/missing arguments, abbreviated SHAs and
non-commit Git objects are rejected. Executable symlinks resolve to the same
CLI on Bun and Node; importing either path performs no CLI work.
Git runs with an argument array and reports a fixed failure message; its stderr
is never forwarded. CLI JSON syntax failures also use a fixed message so parser
diagnostics cannot echo input payloads. Public parser helpers retain their
ordinary thrown errors for programmatic callers.

## Preserved repair policy

The proposal parser, AST verifier and replacement logic are unchanged. Repairs
remain limited to existing `src/modules/NAME.ts` sources with `@yf-schema`,
restricted data interfaces, and additions of distinct plain string literals to
existing nongeneric string-literal-union aliases. Existing alias names,
modifiers, literals, order and duplicates remain protected. Runtime statements,
imports, executable types, broad types, schema-control JSDoc and non-module
paths are still refused. The original nine policy tests remain unchanged.

Bundling requires both changed source and changed generated schema files, valid
schema JSON, and a participating source marker. Sources and schemas must already
be regular tracked files with Git mode 100644 at the base. Added, removed,
renamed, unrelated and untracked files remain refused. As before, this tool
checks schema JSON syntax and source policy; it does not establish schema
freshness or validate fixture evidence.

## Additional filesystem and restore checks

The old Git diff filter did not detect mode-only changes because Git labels
them `M`. Bundling and restoration now check Git summary metadata, and target
files must have no executable bits. All commands require the index to match the
base commit, including content-only staged edits masked by restoring working
files to their base bytes. This protects staged local work and keeps a later
commit from silently including unrelated staged data. The intended repair
handoff starts from a committed fixture-update base with a clean index. Every
index entry must also have the normal cached-file status: `assume-unchanged`
and `skip-worktree` flags are refused across the entire repository, including
unrelated paths. Those flags can hide edits from Git diff/status; refusing them
before inventory or writes protects both repair targets and hidden local work.
Sparse checkouts using skip-worktree entries must use a regular checkout for
this command. The tool does not clear or change index flags automatically. Canonical parent checks
reject ancestor symlinks; leaf checks reject symlinks, dangling symlinks,
nonregular files and hardlinks. Existing output files receive the same checks.
The writer opens without truncating, checks the opened inode and link count,
and only then truncates and writes. New bundle files use exclusive creation
with mode 0600. These checks prevent the concrete alias and mode bypasses; they
are not a hostile-concurrent-filesystem sandbox.

Restore validates the complete bundle and its effective source/schema change
set before writing. It rejects untracked files and tracked changes outside the
bundle, invalid schema JSON, markerless schema sources, duplicate paths and
unsafe targets before its first write. A listed restore target must contain
either its base bytes or the exact bundle bytes; this permits a repeated restore while protecting local edits. Apply
requires every proposed target to match its base bytes. Both commands validate
every target before their first write.

Writes are not a filesystem transaction. A later I/O failure can leave earlier
targets updated or the current file partially written. Callers must inspect the
failure and their Git diff; the tool does not roll back local work. Concurrent
changes after preflight remain outside this guarantee.

## Verification

```sh
bun scripts/test.ts scripts/schema-repair.test.ts scripts/schema-repair-cli.test.ts
```

The normal launcher enforces the read-only repository, writable per-run scratch,
network/PID namespaces and seccomp policy. Tests create real disposable Git
repositories in scratch and exercise CLI subprocesses, including refusal before
writes. No global Git user configuration is changed. Set `YF_TYPECHECK_NODE` to
an explicit Node 24.21.0 executable to add that source-runtime/import proof to
the Bun run; it is not required for the ordinary Bun regressions.

The [stage evidence](results/e02-schema-repair-cli.json) records exact hashes,
commands, runtime versions, 23 passing tests and the scoped strict Node/DOM
TypeScript 6.0.3 check. This stage does not claim the full E02/E03 typecheck
milestone, a production CI repair workflow, live recaching, or publication.
