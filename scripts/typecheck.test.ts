import {
  existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it as nativeIt } from "bun:test";
import * as ts from "typescript";
import { projectIt as test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { checkProjects, negativeControls, parseArguments, prepareCache, repository, strictOptionNames } from "./typecheck.ts";

function characterizeNativeRegistration() {
  nativeIt("numeric timeout", async () => {}, 15);
  // @ts-expect-error Node's name/options/body registration is not Bun's API.
  nativeIt("wrong timeout position", { timeout: 15 }, async () => {});
  // @ts-expect-error Native callback parameters mean done; project context belongs to runner.ts.
  nativeIt("wrong project context", (_context: unknown) => {});
  const standardFetch: typeof fetch = async () => Response.json({});
  const hasPreconnect: "preconnect" extends keyof typeof fetch ? true : false = false;
  // @ts-expect-error Deno globals must not leak into the tooling environment.
  void Deno.args;
  // @ts-expect-error Native Bun globals must not change the public DOM contract.
  void Bun.version;
  return [standardFetch, hasPreconnect];
}
void characterizeNativeRegistration;

function workspace() {
  const scratch = mkdtempSync(join(tmpdir(), "yf-checker-test-"));
  const root = join(scratch, "project");
  mkdirSync(root);
  const put = (file: string, content: string) => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  for (const name of ["tsconfig.base.json", "tsconfig.library.json", "tsconfig.tools.json", "tsconfig.json", ".bun-version", "package.json"]) {
    put(name, readFileSync(join(repository, name), "utf8"));
  }
  put("tests/migration/bun-test-types.d.ts", readFileSync(join(repository, "tests/migration/bun-test-types.d.ts"), "utf8"));
  put("deno.json", JSON.stringify({ exports: { ".": "./src/index.ts" } }));
  put("src/index.ts", "export const value: number = 1;\n");
  put("bin/yahoo-finance.ts", "export const cli = 1;\n");
  put("bin/yahoo-finance-mcp.ts", "export const mcp = 1;\n");
  put("scripts/tool.ts", "export const tool = 1;\n");
  put("tests/helper.ts", "export const helper = 1;\n");
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
  const driver = join(scratch, "driver.mjs");
  writeFileSync(driver, `import {typecheckMain} from ${JSON.stringify(new URL("./typecheck.ts", import.meta.url).href)};process.exitCode=typecheckMain(process.argv.slice(3),process.argv[2]);`);
  return {
    root, scratch, put,
    run(args: string[], environment: NodeJS.ProcessEnv = {}) {
      const result = spawnSync(process.execPath, [driver, root, ...args], {
        cwd: tmpdir(), encoding: "utf8", timeout: 30_000,
        env: { ...process.env, ...environment },
      });
      if (result.error) throw result.error;
      return { code: result.status, output: result.stdout + result.stderr };
    },
    [Symbol.dispose]() { rmSync(scratch, { recursive: true, force: true }); },
  };
}

test("checker options fail closed for unknown, missing and incompatible commands", () => {
  for (const args of [["--project"], ["--project", "unknown"], ["--config", "other.json"], ["--incremental", "--negative"], ["--negative", "--project", "library"], ["--cache-dir", "/tmp/elsewhere"]]) {
    expect(() => parseArguments(args), args.join(" ")).toThrow();
  }
  using space = workspace();
  expect(space.run(["--project"]).code).toBe(2);
  expect(space.run(["--unknown"]).code).toBe(2);
  expect(space.run(["--help"]).code).toBe(0);
  const listed = space.run(["--list"]);
  expect(listed.code, listed.output).toBe(0);
  expect(listed.output).toContain("Workers uses its independent gate");
  expect(existsSync(join(space.root, ".migration-results"))).toBe(false);
  const overlapping = space.run(["--negative"], { TMPDIR: space.root });
  expect(overlapping.code, overlapping.output).toBe(1);
  expect(overlapping.output).toContain("scratch parent must be outside");
  expect(readdirSync(space.root).some((name) => name.startsWith("yf-typecheck-negative-"))).toBe(false);
});

test("checker covers actual production exports, executables and JavaScript with no normal outputs", () => {
  using space = workspace();
  const clean = checkProjects(space.root);
  expect(clean.every((result) => !result.diagnostics.length)).toBe(true);
  expect(clean[0].exports).toEqual(["."]);
  expect(clean[0].roots).toContain("bin/yahoo-finance-mcp.ts");
  expect(existsSync(join(space.root, ".migration-results"))).toBe(false);
  space.put("scripts/invalid.mjs", '/** @type {number} */ export const value = "invalid";\n');
  const invalid = space.run([]);
  expect(invalid.code, invalid.output).toBe(1);
  expect(invalid.output).toContain("TS2322");
  unlinkSync(join(space.root, "scripts/invalid.mjs"));
  space.put("deno.json", JSON.stringify({ exports: { ".": "./src/missing.ts" } }));
  expect(space.run(["--project", "library"]).code).toBe(1);
}, 30_000);

test("incremental checking reuses an owned cache and rejects changed source despite old timestamps", () => {
  using space = workspace();
  expect(checkProjects(space.root, undefined, true).every((result) => !result.diagnostics.length)).toBe(true);
  const cache = join(space.root, ".migration-results/typecheck-v1");
  expect(readdirSync(cache).sort()).toEqual(["library.tsbuildinfo", "owner.json", "tools.tsbuildinfo"]);
  const previous = readFileSync(join(cache, "library.tsbuildinfo"), "utf8");
  expect(checkProjects(space.root, undefined, true).every((result) => !result.diagnostics.length)).toBe(true);
  const source = join(space.root, "src/index.ts");
  const timestamp = lstatSync(source).mtime;
  space.put("src/index.ts", 'export const value: number = "invalid";\n');
  utimesSync(source, timestamp, timestamp);
  const invalid = checkProjects(space.root, undefined, true);
  expect(invalid[0].diagnostics.some((diagnostic) => diagnostic.code === 2322)).toBe(true);
  expect(readFileSync(join(cache, "library.tsbuildinfo"), "utf8")).toBe(previous);
  space.put("src/index.ts", "export const value: number = 1;\n");
  expect(checkProjects(space.root, undefined, true).every((result) => !result.diagnostics.length)).toBe(true);
}, 30_000);

test("incremental cache refuses linked directories, hardlinks, unknown owners and foreign contents", () => {
  for (const kind of ["parent-symlink", "directory-symlink", "owner-hardlink", "output-symlink", "output-hardlink", "dangling-output", "unknown-owner", "foreign-file"] as const) {
    using space = workspace();
    const external = join(space.scratch, "preserved.txt");
    writeFileSync(external, "PRESERVED");
    const parent = join(space.root, ".migration-results");
    if (kind === "parent-symlink") symlinkSync(space.scratch, parent, "dir");
    else if (kind === "directory-symlink") {
      mkdirSync(parent);
      symlinkSync(space.scratch, join(parent, "typecheck-v1"), "dir");
    } else {
      const cache = prepareCache(space.root);
      const owner = join(cache, "owner.json");
      const output = join(cache, "library.tsbuildinfo");
      if (kind === "owner-hardlink") linkSync(owner, join(space.scratch, "owner-alias.json"));
      if (kind === "output-symlink") symlinkSync(external, output);
      if (kind === "output-hardlink") linkSync(external, output);
      if (kind === "dangling-output") symlinkSync(join(space.scratch, "missing.txt"), output);
      if (kind === "unknown-owner") writeFileSync(owner, "OTHER OWNER");
      if (kind === "foreign-file") writeFileSync(join(cache, "foreign.txt"), "OTHER TOOL");
    }
    expect(() => checkProjects(space.root, undefined, true), kind).toThrow();
    expect(readFileSync(external, "utf8")).toBe("PRESERVED");
    expect(readFileSync(join(space.root, "src/index.ts"), "utf8")).toContain("number = 1");
  }
});

test("real checker include graphs and actual options overload directives have rejecting controls", () => {
  const result = negativeControls();
  expect(result.overload).toBeGreaterThan(0);
  expect(result.libraryBuiltins).toBeGreaterThan(0);
  expect(result.included).toEqual([
    "src/typecheck-negative.ts", "bin/typecheck-negative.ts", "scripts/typecheck-negative.ts",
    "tests/typecheck-negative.ts", "scripts/typecheck-negative.mjs",
    "scripts/capture-get-crumb-fixtures.ts", "scripts/capture-get-crumb-fixtures.test.ts",
    "scripts/capture-get-crumb-cli.test.ts", "src/lib/getCrumb.geo.test.ts",
  ]);
  expect(existsSync(join(repository, "src/typecheck-negative.ts"))).toBe(false);
  expect(existsSync(join(repository, "bin/typecheck-negative.ts"))).toBe(false);
}, 90_000);


function cacheContents(root: string) {
  const cache = join(root, ".migration-results/typecheck-v1");
  return readdirSync(cache).sort().map((name) => ({ name, content: readFileSync(join(cache, name), "utf8") }));
}

test("inherited noCheck refuses actual TS and JavaScript assignment failures before cache publication", () => {
  for (const configFile of ["tsconfig.base.json", "tsconfig.tools.json"]) {
    using space = workspace();
    expect(checkProjects(space.root, undefined, true).every((result) => !result.diagnostics.length)).toBe(true);
    const previous = cacheContents(space.root);
    // A tools-only weakening must not let an earlier valid library project
    // publish changed build info before the later configuration is refused.
    space.put("src/index.ts", configFile === "tsconfig.base.json"
      ? 'export const value: number = "invalid";\n' : "export const value: number = 2;\n");
    space.put("tests/helper.ts", 'export const helper: number = "invalid";\n');
    space.put("scripts/invalid.mjs", '/** @type {number} */ export const invalid = "invalid";\n');
    const baseline = checkProjects(space.root);
    const assignmentFiles = baseline.flatMap((result) => result.diagnostics)
      .filter((diagnostic) => diagnostic.code === 2322).map((diagnostic) => diagnostic.file?.fileName);
    expect(assignmentFiles).toContain(join(space.root, "tests/helper.ts"));
    expect(assignmentFiles).toContain(join(space.root, "scripts/invalid.mjs"));
    if (configFile === "tsconfig.base.json") expect(assignmentFiles).toContain(join(space.root, "src/index.ts"));
    const config = JSON.parse(readFileSync(join(space.root, configFile), "utf8"));
    config.compilerOptions.noCheck = true;
    space.put(configFile, JSON.stringify(config));
    for (const mode of [[], ["--incremental"]]) {
      const refused = space.run(mode);
      expect(refused.code, refused.output).toBe(1);
      expect(refused.output).toContain("Semantic checking must not be disabled with noCheck");
      expect(cacheContents(space.root)).toEqual(previous);
    }
  }
  using cold = workspace();
  const config = JSON.parse(readFileSync(join(cold.root, "tsconfig.base.json"), "utf8"));
  config.compilerOptions.noCheck = true;
  cold.put("tsconfig.base.json", JSON.stringify(config));
  expect(cold.run(["--incremental"]).code).toBe(1);
  expect(existsSync(join(cold.root, ".migration-results"))).toBe(false);
}, 30_000);

test("strict-family false overrides refuse real invalid programs and preserve prior caches", () => {
  using space = workspace();
  expect(checkProjects(space.root, undefined, true).every((result) => !result.diagnostics.length)).toBe(true);
  const previous = cacheContents(space.root);
  const base = readFileSync(join(space.root, "tsconfig.base.json"), "utf8");
  const cases = [
    ["noImplicitAny", "export function value(input) { return input; }", 7006],
    ["strictNullChecks", "export const value: number = null;", 2322],
    ["strictFunctionTypes", "export const value: (input: string | number) => void = (input: string) => {};", 2322],
    ["strictBindCallApply", "function value(input: string) { return input; } export const result = value.call(undefined, 1);", 2345],
    ["strictPropertyInitialization", "export class Value { name: string; }", 2564],
    ["strictBuiltinIteratorReturn", "export const value: string = new Set<string>().values().next().value;", 2322],
    ["noImplicitThis", "export function value() { return this.name; }", 2683],
    ["useUnknownInCatchVariables", 'try { throw new Error("synthetic"); } catch (error) { console.log(error.message); } export {};', 18046],
    ["alwaysStrict", "with ({ value: 1 }) {}", 1101],
  ] as const;
  expect(cases.map(([name]) => name).sort()).toEqual([...strictOptionNames].sort());
  for (const [option, source, code] of cases) {
    space.put("tsconfig.base.json", base);
    space.put("src/index.ts", source + "\n");
    const baseline = checkProjects(space.root, ["library"])[0];
    expect(baseline.diagnostics.some((diagnostic) => diagnostic.code === code), `${option}: expected TS${code}`).toBe(true);
    const config = JSON.parse(base);
    config.compilerOptions[option] = false;
    space.put("tsconfig.base.json", JSON.stringify(config));
    for (const mode of [[], ["--incremental"]]) {
      const refused = space.run(mode);
      expect(refused.code, `${option}: ${refused.output}`).toBe(1);
      expect(refused.output).toContain(`Strict compiler option must not be disabled: ${option}`);
      expect(cacheContents(space.root)).toEqual(previous);
    }
  }
}, 30_000);

test("default strict options and explicit true strict options both accept valid programs", () => {
  using space = workspace();
  expect(checkProjects(space.root).every((result) => !result.diagnostics.length)).toBe(true);
  const config = JSON.parse(readFileSync(join(space.root, "tsconfig.base.json"), "utf8"));
  config.compilerOptions.noCheck = false;
  for (const option of strictOptionNames) config.compilerOptions[option] = true;
  space.put("tsconfig.base.json", JSON.stringify(config));
  expect(checkProjects(space.root).every((result) => !result.diagnostics.length)).toBe(true);
  expect(checkProjects(space.root, undefined, true).every((result) => !result.diagnostics.length)).toBe(true);
});


test("maintained imports and effective editor mappings no longer require Deno tooling", () => {
  function references(text: string, name: string) {
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)) found.push(node.argument.literal.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) found.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    return found;
  }
  // Parse syntax, rather than flagging embedded source programs in CLI tests.
  expect(references('const example = \'import "@std/cli";\';', "example.ts")).toEqual([]);
  expect(references('export * from "@std/cli"; import("jsr:example"); type T = import("npm:example").T;', "example.ts"))
    .toEqual(["@std/cli", "jsr:example", "npm:example"]);
  const checked = checkProjects();
  expect(checked.every((result) => !result.diagnostics.length)).toBe(true);
  const files = new Set(checked.flatMap((result) => result.files).filter((file) => /\.(?:ts|mjs)$/.test(file)));
  let count = 0;
  for (const file of files) {
    for (const specifier of references(readFileSync(join(repository, file), "utf8"), file)) {
      expect(/^(?:@std\/|@deno\/|npm:|jsr:)/.test(specifier), `${file}: ${specifier}`).toBe(false);
      count++;
    }
  }
  expect(count).toBeGreaterThan(0);
  const configFile = join(repository, "tsconfig.json");
  const raw = ts.readConfigFile(configFile, ts.sys.readFile);
  expect(raw.error).toBeUndefined();
  const editor = ts.parseJsonConfigFileContent(raw.config, ts.sys, repository, {}, configFile);
  expect(editor.errors).toEqual([]);
  expect(Object.keys(editor.options.paths ?? {})).toEqual(["bun:test"]);
  expect(editor.options.types).toEqual(["node"]);
  const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  expect(Object.hasOwn(manifest.devDependencies, "@types/deno")).toBe(false);
}, 30_000);
