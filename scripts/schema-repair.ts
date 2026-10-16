// Trusted verifier/publisher code. Never import or evaluate proposed source.
import { ts } from "ts-json-schema-generator";

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
    Array.isArray(p.evidence) && p.evidence.length <= 30 &&
      p.evidence.every((s: unknown) =>
        typeof s === "string" && s.length <= 2000
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
      typeof edit.before === "string" && edit.before.length > 0 &&
        typeof edit.after === "string" && edit.before !== edit.after,
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
  const diagnostics =
    (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
      .parseDiagnostics;
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
  return ts.getJSDocTags(node).map((tag) => tag.getText()).sort().join("\n");
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
      ts.isStringLiteral(value) || ts.isNumericLiteral(value) ||
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
    ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ||
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
    !before.typeParameters && !after.typeParameters &&
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
  for (
    const [node, source] of [[before, oldSource], [after, newSource]] as const
  ) {
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
          !text.startsWith("/**") || !/@[A-Za-z]/.test(text),
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
    JSON.stringify([
      source.referencedFiles,
      source.typeReferenceDirectives,
      source.libReferenceDirectives,
    ].map((refs) => refs.map((ref) => ref.fileName)));
  requireCondition(
    directives(oldSource) === directives(newSource),
    "Reference directives must remain unchanged",
  );
  const runtimeDeclarations = (source: ts.SourceFile) =>
    source.statements
      .filter((node) =>
        !ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)
      )
      .map((node) => print(node, source)).join("\n");
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
      previous && print(previous, oldSource) === print(declaration, newSource)
    ) continue;
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
        !declaration.typeParameters && !declaration.heritageClauses &&
          (declaration.modifiers ?? []).every((n) =>
            n.kind === ts.SyntaxKind.ExportKeyword
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
      current.slice(0, offset) + edit.after +
        current.slice(offset + edit.before.length),
    );
  }
  for (const [path, after] of sources) {
    assertSchemaOnly(originals.get(path)!, after);
  }
  return sources;
}

function git(...args: string[]): string {
  const result = new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  requireCondition(result.success, "Git operation failed");
  return new TextDecoder().decode(result.stdout);
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
  const stat = Deno.lstatSync(path);
  requireCondition(
    stat.isFile && !stat.isSymlink,
    "File must be a regular file",
  );
  return git("show", `${base}:${path}`);
}

function changedFiles(base: string) {
  const paths = git("diff", "--name-only", "-z", base).split("\0").filter(
    Boolean,
  );
  requireCondition(
    git("ls-files", "--others", "--exclude-standard", "-z").length === 0,
    "Untracked files are forbidden",
  );
  requireCondition(
    paths.length > 0 && paths.length <= 40,
    "Invalid changed file count",
  );
  requireCondition(
    git("diff", "--name-only", "--diff-filter=ADRTUXB", base).length === 0,
    "Files cannot be added, deleted, renamed, or change mode",
  );
  for (const path of paths) {
    const old = trackedSource(base, path);
    if (sourcePath.test(path)) {
      assertSchemaOnly(old, Deno.readTextFileSync(path));
    } else {
      JSON.parse(Deno.readTextFileSync(path));
      requireCondition(
        git("show", `${base}:${path.replace(/\.schema\.json$/, ".ts")}`)
          .includes("@yf-schema"),
        "Schema must have a source marker",
      );
    }
  }
  requireCondition(
    paths.some((p) => sourcePath.test(p)) &&
      paths.some((p) => schemaPath.test(p)),
    "Repair needs source and regenerated schema changes",
  );
  return paths;
}

if (import.meta.main) {
  const [command, base, input, output] = Deno.args;
  requireCondition(
    /^[0-9a-f]{40}$/.test(base ?? ""),
    "Expected full base commit SHA",
  );
  if (command === "apply") {
    const proposal = parseProposal(Deno.readTextFileSync(input));
    const sources = proposedSources(proposal, (p) => trackedSource(base, p));
    for (const [path, content] of sources) {
      Deno.writeTextFileSync(path, content);
    }
    console.log(
      JSON.stringify({
        ready: proposal.status === "repair",
        summary: proposal.summary,
        evidence: proposal.evidence,
      }),
    );
  } else if (command === "bundle") {
    const proposal = parseProposal(Deno.readTextFileSync(input));
    const files = changedFiles(base).map((path) => ({
      path,
      content: Deno.readTextFileSync(path),
    }));
    Deno.writeTextFileSync(
      output,
      JSON.stringify({
        base,
        summary: proposal.summary,
        evidence: proposal.evidence,
        files,
      }),
    );
  } else if (command === "restore") {
    const raw = Deno.readTextFileSync(input);
    requireCondition(raw.length <= 2 * 1024 * 1024, "Bundle too large");
    const bundle = JSON.parse(raw);
    requireCondition(
      bundle.base === base && Array.isArray(bundle.files) &&
        bundle.files.length > 0 && bundle.files.length <= 40,
      "Invalid verified bundle",
    );
    const paths = new Set<string>();
    for (const file of bundle.files) {
      requireCondition(
        typeof file.path === "string" && typeof file.content === "string" &&
          !paths.has(file.path),
        "Invalid bundle file",
      );
      paths.add(file.path);
      const old = trackedSource(base, file.path);
      if (sourcePath.test(file.path)) assertSchemaOnly(old, file.content);
      else JSON.parse(file.content);
    }
    for (const file of bundle.files) {
      Deno.writeTextFileSync(file.path, file.content);
    }
    changedFiles(base);
  } else throw new Error("Expected apply, bundle, or restore");
}
