// Shared by ordinary schema generation and the trusted schema-repair verifier.
// Inspect candidate text only; never import or execute candidate source.
import { dirname, join, normalize, relative, resolve } from "@std/path";
import { ts } from "ts-json-schema-generator";

export interface DateContractException {
  file: string;
  member: string;
  type: string;
  kind: "semantic" | "next-major";
  reason: string;
  targetType?: "Date" | "DateInMs" | "number";
}

const screener = "src/modules/screener.ts";
const quote = "src/modules/quote.ts";
const summary = "src/modules/quoteSummary-iface.ts";

function migration(
  file: string,
  member: string,
  type: string,
  targetType: NonNullable<DateContractException["targetType"]>,
  reason: string,
): DateContractException {
  return { file, member, type, kind: "next-major", reason, targetType };
}

/**
 * Permanent semantics and frozen v5 debt: docs/next-major.md and GitHub #1040.
 * Remove next-major entries when migrating the corresponding declarations.
 */
export const dateContractExceptions: readonly DateContractException[] = [
  {
    file: summary,
    member: "EarningsChart.currentQuarterEstimateDate",
    type: "string",
    kind: "semantic",
    reason: 'Quarter label such as "2Q", not a calendar date.',
  },
  migration(
    screener,
    "ScreenerResultBase.creationDate",
    "number",
    "DateInMs",
    "Creation timestamp in milliseconds.",
  ),
  migration(
    screener,
    "ScreenerResultBase.lastUpdated",
    "number",
    "DateInMs",
    "Update timestamp in milliseconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.firstTradeDateMilliseconds",
    "number",
    "DateInMs",
    "First-trade timestamp in milliseconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.postMarketTime",
    "number",
    "Date",
    "Market timestamp in seconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.regularMarketTime",
    "number",
    "Date",
    "Market timestamp in seconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.earningsTimestamp",
    "number",
    "Date",
    "Earnings timestamp in seconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.earningsTimestampStart",
    "number",
    "Date",
    "Earnings timestamp in seconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.earningsTimestampEnd",
    "number",
    "Date",
    "Earnings timestamp in seconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.exchangeTransferDate",
    "string",
    "Date",
    "Calendar date string; published in v4.0.3.",
  ),
  migration(
    screener,
    "ScreenerQuote.dividendDate",
    "number",
    "Date",
    "Dividend timestamp in seconds.",
  ),
  migration(
    screener,
    "ScreenerQuote.nameChangeDate",
    "number",
    "Date",
    "ISO input is currently truncated to its year.",
  ),
  migration(
    screener,
    "ScreenerQuote.ipoExpectedDate",
    "number",
    "Date",
    "ISO input is currently truncated to its year.",
  ),
  migration(
    quote,
    "QuoteOption.expireDate",
    "number",
    "Date",
    "Expiration timestamp in seconds.",
  ),
  migration(
    quote,
    "QuoteAltSymbol.expireIsoDate",
    "string",
    "Date",
    "ISO expiration timestamp.",
  ),
  migration(
    summary,
    "DefaultKeyStatistics.lastSplitDate",
    "number",
    "Date",
    "Split timestamp in seconds.",
  ),
  migration(
    summary,
    "DefaultKeyStatistics.sharesShortPriorMonth",
    "Date",
    "number",
    "Share count incorrectly converted to a date.",
  ),
];

const printer = ts.createPrinter({ removeComments: true });

/** Throws on new drift, changed exception types, or stale exception entries. */
export function assertDateContracts(
  file: string,
  text: string,
  exceptions: readonly DateContractException[] = dateContractExceptions,
): void {
  const fileName = relative(Deno.cwd(), resolve(file)).replaceAll("\\", "/");
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const errors: string[] = [];
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  const declared = new Set<string>();
  const millisecondImports = new Set<string>();
  const entries = new Map<string, DateContractException>();
  const seen = new Set<string>();
  for (const entry of exceptions.filter((entry) => entry.file === fileName)) {
    if (entries.has(entry.member)) {
      throw new Error(`Duplicate date exception: ${entry.member}`);
    }
    entries.set(entry.member, entry);
  }

  for (const node of source.statements) {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node);
    if (
      ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node) || ts.isImportEqualsDeclaration(node)
    ) {
      if (node.name) declared.add(node.name.text);
    }
    if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      if (clause.name) declared.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        declared.add(bindings.name.text);
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          declared.add(binding.name.text);
          if (
            (binding.propertyName ?? binding.name).text === "DateInMs" &&
            ts.isStringLiteral(node.moduleSpecifier) &&
            normalize(join(dirname(fileName), node.moduleSpecifier.text))
                .replaceAll("\\", "/") === "src/lib/commonTypes.ts"
          ) millisecondImports.add(binding.name.text);
        }
      }
    }
  }

  function absent(node: ts.TypeNode): boolean {
    if (ts.isParenthesizedTypeNode(node)) return absent(node.type);
    return node.kind === ts.SyntaxKind.UndefinedKeyword ||
      ts.isLiteralTypeNode(node) &&
        node.literal.kind === ts.SyntaxKind.NullKeyword;
  }

  function dateType(
    node: ts.TypeNode,
    bound: Set<string>,
    resolving = new Set<string>(),
  ): boolean {
    if (ts.isParenthesizedTypeNode(node)) {
      return dateType(node.type, bound, resolving);
    }
    if (ts.isUnionTypeNode(node)) {
      const values = node.types.filter((type) => !absent(type));
      return values.length > 0 &&
        values.every((type) => dateType(type, bound, resolving));
    }
    if (ts.isArrayTypeNode(node)) {
      return dateType(node.elementType, bound, resolving);
    }
    if (
      ts.isTypeOperatorNode(node) &&
      node.operator === ts.SyntaxKind.ReadonlyKeyword
    ) {
      return dateType(node.type, bound, resolving);
    }
    if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)) {
      return false;
    }
    const name = node.typeName.text;
    if (bound.has(name)) return false;
    const alias = aliases.get(name);
    if (alias) {
      if (
        alias.typeParameters?.length || node.typeArguments?.length ||
        resolving.has(name)
      ) return false;
      return dateType(alias.type, new Set(), new Set([...resolving, name]));
    }
    if (name === "Date" && !declared.has(name)) {
      return !node.typeArguments?.length;
    }
    if (millisecondImports.has(name)) return !node.typeArguments?.length;
    if ((name === "Array" || name === "ReadonlyArray") && !declared.has(name)) {
      return node.typeArguments?.length === 1 &&
        dateType(node.typeArguments[0], bound, resolving);
    }
    return false;
  }

  function visit(node: ts.Node, owner = "", bound = new Set<string>()) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      owner = node.name.text;
    }
    if ("typeParameters" in node) {
      const parameters = (node as ts.InterfaceDeclaration).typeParameters ?? [];
      bound = new Set([
        ...bound,
        ...parameters.map((parameter) => parameter.name.text),
      ]);
    }
    if (ts.isPropertySignature(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
        ? node.name.text
        : undefined;
      const member = `${owner}.${name}`;
      const exception = entries.get(member);
      if (exception) {
        seen.add(member);
        const actual = node.type
          ? printer.printNode(ts.EmitHint.Unspecified, node.type, source)
          : "<missing type>";
        if (actual !== exception.type) {
          errors.push(
            `${member}: exception freezes ${exception.type}, received ${actual}; review and remove/update its entry explicitly`,
          );
        }
      } else if (
        name?.endsWith("Date") && (!node.type || !dateType(node.type, bound))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        errors.push(
          `${member} (line ${
            line + 1
          }): use Date or DateInMs for normalized dates, or add a reviewed semantic exception`,
        );
      }
      if (node.type) visit(node.type, member, bound);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, owner, bound));
  }
  visit(source);
  for (const member of entries.keys()) {
    if (!seen.has(member)) {
      errors.push(
        `${member}: stale date exception; remove its entry explicitly`,
      );
    }
  }
  if (errors.length) {
    throw new Error(
      `Date contract check failed in ${fileName}:\n${errors.join("\n")}`,
    );
  }
}
