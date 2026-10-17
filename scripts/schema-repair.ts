// Trusted verifier/publisher code. Never import or evaluate proposed source.
import { ts } from "ts-json-schema-generator";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RepairProposal {
  status: "repair" | "blocked";
  summary: string;
  evidence: string[];
  edits: { path: string; before: string; after: string }[];
}

const sourcePath = /^src\/modules\/[A-Za-z][A-Za-z0-9-]*\.ts$/;
const schemaPath = /^src\/modules\/[A-Za-z][A-Za-z0-9-]*\.schema\.json$/;
const printer = ts.createPrinter();

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function parseProposal(text: string): RepairProposal {
  requireCondition(
    new TextEncoder().encode(text).length <= 256 * 1024,
    "Proposal too large",
  );
  const p = JSON.parse(text);
  requireCondition(
    p && typeof p === "object" && !Array.isArray(p),
    "Expected proposal object",
  );
  requireCondition(
    Object.keys(p).sort().join() === "edits,evidence,status,summary",
    "Unexpected proposal keys",
  );
  requireCondition(
    p.status === "repair" || p.status === "blocked",
    "Invalid status",
  );
  requireCondition(
    typeof p.summary === "string" && p.summary.length <= 4000,
    "Invalid summary",
  );
  requireCondition(
    Array.isArray(p.evidence) &&
      p.evidence.length <= 30 &&
      p.evidence.every(
        (s: unknown) => typeof s === "string" && s.length <= 2000,
      ),
    "Invalid evidence",
  );
  requireCondition(
    Array.isArray(p.edits) && p.edits.length <= 100,
    "Invalid edits",
  );
  requireCondition(
    p.status === "repair" ? p.edits.length > 0 : p.edits.length === 0,
    "Status does not match edits",
  );
  for (const edit of p.edits) {
    requireCondition(
      edit && Object.keys(edit).sort().join() === "after,before,path",
      "Invalid edit keys",
    );
    requireCondition(
      typeof edit.path === "string" && sourcePath.test(edit.path),
      "Only module source edits are allowed",
    );
    requireCondition(
      typeof edit.before === "string" &&
        edit.before.length > 0 &&
        typeof edit.after === "string" &&
        edit.before !== edit.after,
      "Invalid replacement",
    );
  }
  return p;
}

function parseSource(text: string): ts.SourceFile {
  const source = ts.createSourceFile(
    "module.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const diagnostics = (
    source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  requireCondition(
    diagnostics.length === 0,
    "Proposed source has syntax errors",
  );
  return source;
}

function print(node: ts.Node, source: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, source);
}

function tags(node: ts.Node): string {
  return ts
    .getJSDocTags(node)
    .map((tag) => tag.getText())
    .sort()
    .join("\n");
}

function assertDataType(node: ts.TypeNode) {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BooleanKeyword:
      return;
  }
  if (ts.isLiteralTypeNode(node)) {
    const value = node.literal;
    requireCondition(
      ts.isStringLiteral(value) ||
        ts.isNumericLiteral(value) ||
        value.kind === ts.SyntaxKind.NullKeyword ||
        value.kind === ts.SyntaxKind.TrueKeyword ||
        value.kind === ts.SyntaxKind.FalseKeyword ||
        (ts.isPrefixUnaryExpression(value) &&
          value.operator === ts.SyntaxKind.MinusToken &&
          ts.isNumericLiteral(value.operand)),
      "Unsupported literal type",
    );
  } else if (ts.isTypeReferenceNode(node)) {
    requireCondition(
      ts.isIdentifier(node.typeName),
      "Qualified type references require manual review",
    );
    requireCondition(
      !["Object", "Function", "Record"].includes(node.typeName.text),
      "Broad data types require manual review",
    );
    for (const argument of node.typeArguments ?? []) assertDataType(argument);
  } else if (ts.isArrayTypeNode(node)) {
    assertDataType(node.elementType);
  } else if (ts.isUnionTypeNode(node)) {
    for (const child of node.types) assertDataType(child);
  } else if (ts.isParenthesizedTypeNode(node)) {
    assertDataType(node.type);
  } else if (ts.isTypeLiteralNode(node)) {
    requireCondition(
      node.members.length > 0,
      "Empty object types require manual review",
    );
    for (const member of node.members) assertDataMember(member);
  } else {
    throw new Error("Broad or executable type syntax requires manual review");
  }
}

function assertDataMember(member: ts.TypeElement) {
  requireCondition(
    ts.isPropertySignature(member) && member.type,
    "Only typed data properties may be added or changed",
  );
  requireCondition(
    ts.isIdentifier(member.name) ||
      ts.isStringLiteral(member.name) ||
      ts.isNumericLiteral(member.name),
    "Computed properties are forbidden",
  );
  requireCondition(
    tags(member) === "",
    "Schema-control JSDoc tags require manual review",
  );
  assertDataType(member.type);
}

function interfaces(source: ts.SourceFile) {
  const result = new Map<string, ts.InterfaceDeclaration>();
  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue;
    requireCondition(
      !result.has(statement.name.text),
      "Merged interfaces require manual review",
    );
    result.set(statement.name.text, statement);
  }
  return result;
}

function memberKey(member: ts.TypeElement, source: ts.SourceFile): string {
  return member.name ? print(member.name, source) : print(member, source);
}

function aliases(source: ts.SourceFile) {
  const result = new Map<string, ts.TypeAliasDeclaration>();
  for (const statement of source.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;
    requireCondition(
      !result.has(statement.name.text),
      "Duplicate type aliases are forbidden",
    );
    result.set(statement.name.text, statement);
  }
  return result;
}

function stringUnionValues(node: ts.TypeNode): string[] {
  requireCondition(
    ts.isUnionTypeNode(node),
    "Only existing string-literal unions may be extended",
  );
  return node.types.map((member) => {
    requireCondition(
      ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal),
      "Union additions must be plain string literals",
    );
    requireCondition(
      tags(member) === "",
      "Schema-control JSDoc tags require manual review",
    );
    return member.literal.text;
  });
}

function assertStringUnionAdditions(
  before: ts.TypeAliasDeclaration,
  after: ts.TypeAliasDeclaration,
  oldSource: ts.SourceFile,
  newSource: ts.SourceFile,
) {
  requireCondition(
    !before.typeParameters &&
      !after.typeParameters &&
      JSON.stringify(
        before.modifiers?.map((n) => print(n, oldSource)) ?? [],
      ) ===
        JSON.stringify(after.modifiers?.map((n) => print(n, newSource)) ?? []),
    "Changed aliases must be nongeneric and preserve their modifiers",
  );
  requireCondition(
    tags(before) === "" && tags(after) === "",
    "Schema-control JSDoc tags require manual review",
  );
  for (const [node, source] of [
    [before, oldSource],
    [after, newSource],
  ] as const) {
    // TypeScript does not attach every inline JSDoc comment to a union member.
    // Scan comment tokens too, without treating text inside a string as a tag.
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      source.text.slice(node.getFullStart(), node.end),
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      const text = scanner.getTokenText();
      requireCondition(
        token !== ts.SyntaxKind.MultiLineCommentTrivia ||
          !text.startsWith("/**") ||
          !/@[A-Za-z]/.test(text),
        "Schema-control JSDoc tags require manual review",
      );
    }
  }
  const previous = stringUnionValues(before.type);
  const next = stringUnionValues(after.type);
  const existing = new Set(previous);
  const retained = next.filter((value) => existing.has(value));
  const added = next.filter((value) => !existing.has(value));
  requireCondition(
    JSON.stringify(retained) === JSON.stringify(previous),
    "Existing union literals must retain their order and multiplicity",
  );
  requireCondition(
    added.length > 0 && new Set(added).size === added.length,
    "Union edits must add distinct new string literals",
  );
}

export function assertSchemaOnly(before: string, after: string) {
  requireCondition(
    before.includes("@yf-schema"),
    "Source must already participate in schema generation",
  );
  const oldSource = parseSource(before);
  const newSource = parseSource(after);
  requireCondition(
    before.match(/^#![^\n]*/)?.[0] === after.match(/^#![^\n]*/)?.[0],
    "Shebang changes are forbidden",
  );
  const directives = (source: ts.SourceFile) =>
    JSON.stringify(
      [
        source.referencedFiles,
        source.typeReferenceDirectives,
        source.libReferenceDirectives,
      ].map((refs) => refs.map((ref) => ref.fileName)),
    );
  requireCondition(
    directives(oldSource) === directives(newSource),
    "Reference directives must remain unchanged",
  );
  const runtimeDeclarations = (source: ts.SourceFile) =>
    source.statements
      .filter(
        (node) =>
          !ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node),
      )
      .map((node) => print(node, source))
      .join("\n");
  requireCondition(
    runtimeDeclarations(oldSource) === runtimeDeclarations(newSource),
    "Runtime, imports, and other declarations must remain unchanged",
  );
  const oldAliases = aliases(oldSource);
  const newAliases = aliases(newSource);
  requireCondition(
    oldAliases.size === newAliases.size &&
      [...oldAliases.keys()].every((name) => newAliases.has(name)),
    "Type aliases cannot be added, removed, or renamed",
  );
  let changed = false;
  for (const [name, declaration] of newAliases) {
    const previous = oldAliases.get(name)!;
    if (print(previous, oldSource) === print(declaration, newSource)) continue;
    assertStringUnionAdditions(previous, declaration, oldSource, newSource);
    changed = true;
  }
  const oldInterfaces = interfaces(oldSource);
  const newInterfaces = interfaces(newSource);
  for (const name of oldInterfaces.keys()) {
    requireCondition(newInterfaces.has(name), "Interfaces cannot be removed");
  }
  for (const [name, declaration] of newInterfaces) {
    const previous = oldInterfaces.get(name);
    if (
      previous &&
      print(previous, oldSource) === print(declaration, newSource)
    )
      continue;
    changed = true;
    requireCondition(
      tags(declaration) === "",
      "Schema-control JSDoc tags require manual review",
    );
    const header = (node: ts.InterfaceDeclaration, source: ts.SourceFile) =>
      JSON.stringify({
        modifiers: node.modifiers?.map((n) => print(n, source)) ?? [],
        parameters: node.typeParameters?.map((n) => print(n, source)) ?? [],
        heritage: node.heritageClauses?.map((n) => print(n, source)) ?? [],
      });
    if (previous) {
      requireCondition(
        header(previous, oldSource) === header(declaration, newSource),
        "Interface headers must remain unchanged",
      );
    } else {
      requireCondition(
        !declaration.typeParameters &&
          !declaration.heritageClauses &&
          (declaration.modifiers ?? []).every(
            (n) => n.kind === ts.SyntaxKind.ExportKeyword,
          ),
        "New interfaces must be plain data interfaces",
      );
    }
    requireCondition(
      declaration.members.length > 0,
      "Empty interfaces require manual review",
    );
    const oldMembers = new Map(
      (previous?.members ?? []).map((m) => [memberKey(m, oldSource), m]),
    );
    const newMembers = new Map(
      declaration.members.map((m) => [memberKey(m, newSource), m]),
    );
    requireCondition(
      newMembers.size === declaration.members.length,
      "Duplicate properties are forbidden",
    );
    for (const key of oldMembers.keys()) {
      requireCondition(
        newMembers.has(key),
        "Existing members cannot be removed",
      );
    }
    for (const [key, member] of newMembers) {
      const old = oldMembers.get(key);
      if (old && print(old, oldSource) === print(member, newSource)) continue;
      assertDataMember(member);
    }
  }
  requireCondition(changed, "No permitted schema type change found");
}

export function proposedSources(
  proposal: RepairProposal,
  read: (path: string) => string,
) {
  const sources = new Map<string, string>();
  const originals = new Map<string, string>();
  for (const edit of proposal.edits) {
    const original = originals.get(edit.path) ?? read(edit.path);
    originals.set(edit.path, original);
    const current = sources.get(edit.path) ?? original;
    const offset = current.indexOf(edit.before);
    requireCondition(
      offset >= 0 && current.indexOf(edit.before, offset + 1) === -1,
      "Replacement must match exactly once",
    );
    sources.set(
      edit.path,
      current.slice(0, offset) +
        edit.after +
        current.slice(offset + edit.before.length),
    );
  }
  for (const [path, after] of sources) {
    assertSchemaOnly(originals.get(path)!, after);
  }
  return sources;
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  // Git stderr can include remote URLs or contents. Never forward it.
  requireCondition(
    !result.error && result.status === 0,
    "Git operation failed",
  );
  return result.stdout;
}

function regularFile(file: string) {
  const absolute = resolve(file);
  requireCondition(
    realpathSync(dirname(absolute)) === dirname(absolute),
    "File parents must not contain symlinks",
  );
  const stat = lstatSync(absolute);
  requireCondition(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    "File must be a regular file without symlinks or hardlinks",
  );
  requireCondition(
    (stat.mode & 0o111) === 0,
    "File mode changes are forbidden",
  );
  return stat;
}

/** Check aliases before opening, then check the opened inode before truncation. */
function writeRegularFile(file: string, content: string, create = false) {
  const absolute = resolve(file);
  requireCondition(
    realpathSync(dirname(absolute)) === dirname(absolute),
    "File parents must not contain symlinks",
  );
  // lstat also sees a dangling symlink, whereas existsSync follows it.
  let previous: ReturnType<typeof regularFile> | undefined;
  try {
    previous = regularFile(absolute);
  } catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT")
      throw error;
  }
  const fd = openSync(
    absolute,
    constants.O_WRONLY |
      constants.O_NOFOLLOW |
      (previous ? 0 : constants.O_CREAT | constants.O_EXCL),
    0o600,
  );
  try {
    const stat = fstatSync(fd);
    requireCondition(
      stat.isFile() &&
        stat.nlink === 1 &&
        (stat.mode & 0o111) === 0 &&
        (!previous || (stat.dev === previous.dev && stat.ino === previous.ino)),
      "File changed before writing",
    );
    ftruncateSync(fd, 0);
    writeFileSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

function trackedSource(base: string, path: string): string {
  requireCondition(
    sourcePath.test(path) || schemaPath.test(path),
    "Forbidden path",
  );
  requireCondition(
    git("ls-tree", base, "--", path).startsWith("100644 blob "),
    "Only existing regular tracked files are allowed",
  );
  regularFile(path);
  return git("show", `${base}:${path}`);
}

function requireCleanIndex(base: string) {
  // Git diff/status can hide worktree edits under these flags. Inspect every
  // index entry, including unrelated paths, before trusting either inventory.
  requireCondition(
    git("ls-files", "-v", "-z")
      .split("\0")
      .filter(Boolean)
      .every((entry) => entry.startsWith("H ")),
    "Index must not use assume-unchanged or skip-worktree flags",
  );
  requireCondition(
    git("diff", "--cached", "--name-only", "-z", base).length === 0,
    "Staged changes are forbidden",
  );
}

function workingChanges(base: string) {
  requireCleanIndex(base);
  requireCondition(
    git("ls-files", "--others", "--exclude-standard", "-z").length === 0,
    "Untracked files are forbidden",
  );
  requireCondition(
    git("diff", "--name-only", "--diff-filter=ADRTUXB", base).length === 0,
    "Files cannot be added, deleted, renamed, or change mode",
  );
  // Mode-only changes have status M and evade the filter above. Also check the
  // index, including when a subsequent worktree chmod masks a staged mode edit.
  requireCondition(
    git("diff", "--summary", base).length === 0 &&
      git("diff", "--cached", "--summary", base).length === 0,
    "File mode changes are forbidden",
  );
  return git("diff", "--name-only", "-z", base).split("\0").filter(Boolean);
}

function validateContent(
  base: string,
  path: string,
  content: string,
  old = trackedSource(base, path),
) {
  if (sourcePath.test(path)) {
    assertSchemaOnly(old, content);
  } else {
    JSON.parse(content);
    requireCondition(
      git("show", `${base}:${path.replace(/\.schema\.json$/, ".ts")}`).includes(
        "@yf-schema",
      ),
      "Schema must have a source marker",
    );
  }
}

function requireRepairPaths(paths: string[]) {
  requireCondition(
    paths.length > 0 && paths.length <= 40,
    "Invalid changed file count",
  );
  requireCondition(
    paths.some((p) => sourcePath.test(p)) &&
      paths.some((p) => schemaPath.test(p)),
    "Repair needs source and regenerated schema changes",
  );
}

function changedFiles(base: string) {
  const paths = workingChanges(base);
  requireRepairPaths(paths);
  for (const path of paths) {
    const old = trackedSource(base, path);
    validateContent(base, path, readFileSync(path, "utf8"), old);
  }
  return paths;
}

/** Trusted CLI only: proposed source is parsed, never imported or evaluated. */
export function schemaRepairMain(args: string[]): void {
  const [command, base, input, output] = args;
  requireCondition(
    command === "apply" || command === "bundle" || command === "restore",
    "Expected apply, bundle, or restore",
  );
  requireCondition(
    args.length === (command === "bundle" ? 4 : 3),
    "Expected COMMAND BASE_SHA INPUT [BUNDLE_OUTPUT]",
  );
  requireCondition(
    /^[0-9a-f]{40}$/.test(base ?? ""),
    "Expected full base commit SHA",
  );
  requireCondition(
    git("cat-file", "-t", base).trim() === "commit",
    "Expected a base commit",
  );
  requireCondition(
    realpathSync(git("rev-parse", "--show-toplevel").trim()) ===
      realpathSync(process.cwd()),
    "Run schema repair from the repository root",
  );
  if (command === "apply") {
    const proposal = parseProposal(readFileSync(input, "utf8"));
    requireCleanIndex(base);
    const sources = proposedSources(proposal, (path) => {
      const old = trackedSource(base, path);
      requireCondition(
        readFileSync(path, "utf8") === old,
        "Apply target has local edits",
      );
      return old;
    });
    // Preflight the entire batch before its first write.
    for (const path of sources.keys()) regularFile(path);
    for (const [path, content] of sources) writeRegularFile(path, content);
    console.log(
      JSON.stringify({
        ready: proposal.status === "repair",
        summary: proposal.summary,
        evidence: proposal.evidence,
      }),
    );
  } else if (command === "bundle") {
    const proposal = parseProposal(readFileSync(input, "utf8"));
    const files = changedFiles(base).map((path) => ({
      path,
      content: readFileSync(path, "utf8"),
    }));
    writeRegularFile(
      output,
      JSON.stringify({
        base,
        summary: proposal.summary,
        evidence: proposal.evidence,
        files,
      }),
      true,
    );
  } else {
    const raw = readFileSync(input, "utf8");
    requireCondition(raw.length <= 2 * 1024 * 1024, "Bundle too large");
    const bundle = JSON.parse(raw);
    requireCondition(
      bundle &&
        typeof bundle === "object" &&
        bundle.base === base &&
        Array.isArray(bundle.files) &&
        bundle.files.length > 0 &&
        bundle.files.length <= 40,
      "Invalid verified bundle",
    );
    const files = new Map<string, string>();
    const changed: string[] = [];
    for (const file of bundle.files) {
      requireCondition(
        file &&
          typeof file.path === "string" &&
          typeof file.content === "string" &&
          !files.has(file.path),
        "Invalid bundle file",
      );
      const old = trackedSource(base, file.path);
      const current = readFileSync(file.path, "utf8");
      requireCondition(
        current === old || current === file.content,
        "Restore target has local edits",
      );
      if (old !== file.content) {
        validateContent(base, file.path, file.content, old);
        changed.push(file.path);
      } else if (schemaPath.test(file.path)) {
        JSON.parse(file.content);
      }
      files.set(file.path, file.content);
    }
    requireRepairPaths(changed);
    // Check unrelated state before writing, rather than discovering it after
    // restoring a valid source file. All listed targets are preflighted above.
    requireCondition(
      workingChanges(base).every((path) => files.has(path)),
      "Unrelated working-tree changes are forbidden",
    );
    for (const [path, content] of files) writeRegularFile(path, content);
    changedFiles(base);
  }
}

function isMain(): boolean {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(resolve(process.argv[1])) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    // An importing host may provide a synthetic or missing argv entry.
    return false;
  }
}

if (isMain()) {
  try {
    schemaRepairMain(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof SyntaxError
        ? "Input is not valid JSON"
        : error instanceof Error
          ? error.message
          : "Schema repair failed",
    );
    process.exitCode = 1;
  }
}
