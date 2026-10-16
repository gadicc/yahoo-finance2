/** Maintained TypeScript 6 checker; no Deno process or experimental launcher. */
import * as ts from "typescript";
import { randomUUID } from "node:crypto";
import {
  closeSync, constants, copyFileSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
export const projects = ["library", "tools"] as const;
export type Project = typeof projects[number];
export interface CheckResult {
  project: Project;
  roots: string[];
  files: string[];
  exports: string[];
  diagnostics: readonly ts.Diagnostic[];
}
const marker = '{"tool":"yahoo-finance2/scripts/typecheck.ts","format":1}\n';
const cacheFiles = new Set(["owner.json", "library.tsbuildinfo", "tools.tsbuildinfo"]);
const help = `Usage: bun scripts/typecheck.ts [--incremental | --negative | --list] [--project library|tools]
No arguments checks the production library and maintained tools/tests.
--incremental writes only the owned .migration-results/typecheck-v1 cache.
--negative proves overload rejection and include coverage in disposable scratch.
--list prints actual root inventories and explicit exclusions, without compiling.
Workers uses its independent gate; historical experiment inputs remain separate.
`;

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function stat(file: string) {
  try { return lstatSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
function inside(file: string, directory: string) {
  return file === directory || file.startsWith(directory + sep);
}
function regular(file: string) {
  const value = stat(file);
  requireCondition(value?.isFile() && !value.isSymbolicLink() && value.nlink === 1,
    "Typecheck cache entries must be regular files without symlinks or hardlinks");
}
function directory(file: string, create: boolean) {
  if (!stat(file) && create) mkdirSync(file, { mode: 0o700 });
  const value = stat(file);
  requireCondition(value?.isDirectory() && !value.isSymbolicLink() && realpathSync(file) === file,
    "Typecheck cache directories must be canonical directories without symlinks");
}
function exclusive(file: string, content: string) {
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, content); }
  finally { closeSync(fd); }
}

/** Never delete or silently adopt another tool's files, links or directories. */
export function prepareCache(root: string): string {
  const canonical = realpathSync(root);
  const parent = join(canonical, ".migration-results");
  directory(parent, true);
  const cache = join(parent, "typecheck-v1");
  const existed = !!stat(cache);
  directory(cache, true);
  if (!existed) exclusive(join(cache, "owner.json"), marker);
  validateCache(cache);
  return cache;
}
function validateCache(cache: string) {
  directory(dirname(cache), false);
  directory(cache, false);
  for (const name of readdirSync(cache)) {
    requireCondition(cacheFiles.has(name), "Unrecognized typecheck cache contents; preserve and inspect this directory");
    regular(join(cache, name));
  }
  regular(join(cache, "owner.json"));
  requireCondition(readFileSync(join(cache, "owner.json"), "utf8") === marker,
    "Unrecognized typecheck cache owner; preserve and inspect this directory");
}
function writeCache(cache: string, file: string, content: string) {
  requireCondition(projects.some((project) => file === join(cache, `${project}.tsbuildinfo`)),
    "Compiler attempted an unexpected typecheck output");
  validateCache(cache);
  const temporary = join(cache, `.staged-${randomUUID()}`);
  exclusive(temporary, content);
  try {
    // Validate existing output again without treating our private temporary as
    // an owned persistent cache entry. No target is truncated or followed.
    directory(dirname(cache), false);
    directory(cache, false);
    regular(join(cache, "owner.json"));
    requireCondition(readFileSync(join(cache, "owner.json"), "utf8") === marker,
      "Typecheck cache owner changed during checking");
    if (stat(file)) regular(file);
    renameSync(temporary, file);
  } finally {
    if (stat(temporary)) rmSync(temporary);
  }
}

// Explicit public CompilerOptions keys for the pinned TS6 strict family. TS6
// enables alwaysStrict independently by default; keep its parser strictness too.
export const strictOptionNames = [
  "noImplicitAny", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply",
  "strictPropertyInitialization", "strictBuiltinIteratorReturn", "noImplicitThis",
  "useUnknownInCatchVariables", "alwaysStrict",
] as const satisfies readonly (keyof ts.CompilerOptions)[];

function configuration(root: string, project: Project) {
  const file = join(root, `tsconfig.${project}.json`);
  const config = ts.readConfigFile(file, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {}, file);
  requireCondition(parsed.errors.length === 0, ts.formatDiagnostics(parsed.errors, diagnosticHost(root)));
  const options = parsed.options;
  requireCondition(options.noCheck !== true, "Semantic checking must not be disabled with noCheck");
  for (const name of strictOptionNames) {
    requireCondition(options[name] !== false, `Strict compiler option must not be disabled: ${name}`);
  }
  requireCondition(options.strict && options.noEmit && options.target === ts.ScriptTarget.ES2022 &&
    options.module === ts.ModuleKind.ESNext && options.moduleResolution === ts.ModuleResolutionKind.Bundler &&
    JSON.stringify(options.types) === '["node"]', "Production typecheck requires strict ES2022/Bundler, no emit and Node-only ambient types");
  if (project === "tools") requireCondition(options.checkJs, "Tooling must semantically check maintained JavaScript");
  return parsed;
}
function productionExports(root: string, roots: string[]): string[] {
  const metadata = JSON.parse(readFileSync(join(root, "deno.json"), "utf8"));
  requireCondition(metadata.exports && typeof metadata.exports === "object" && !Array.isArray(metadata.exports),
    "Expected the retained consumer export inventory");
  const inventory = new Set(roots.map((file) => resolve(file)));
  const names = Object.keys(metadata.exports);
  requireCondition(names.length > 0, "Production export inventory is empty");
  for (const value of Object.values(metadata.exports)) {
    requireCondition(typeof value === "string" && value.startsWith("./src/") && value.endsWith(".ts") &&
      inside(resolve(root, value), join(root, "src")) && inventory.has(resolve(root, value)),
      "A consumer export is missing from the production library roots");
  }
  for (const name of ["bin/yahoo-finance.ts", "bin/yahoo-finance-mcp.ts"]) {
    requireCondition(inventory.has(join(root, name)), "An executable is missing from the production library roots");
  }
  return names;
}
function diagnosticHost(root: string): ts.FormatDiagnosticsHost {
  return { getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => "\n" };
}
export function checkProjects(root = repository, selected: readonly Project[] = projects, incremental = false): CheckResult[] {
  const canonical = realpathSync(root);
  // Validate every effective selected configuration before creating any cache or
  // emitting a successful project's build info. Inheritance must not silently
  // disable checks, nor may a later invalid project update an earlier cache.
  const configured = selected.map((project) => {
    const parsed = configuration(canonical, project);
    const exports = project === "library" ? productionExports(canonical, parsed.fileNames) : [];
    return { project, parsed, exports };
  });
  const cache = incremental ? prepareCache(canonical) : undefined;
  return configured.map(({ project, parsed, exports }) => {
    const options = { ...parsed.options };
    let program: ts.Program;
    let emit: (() => ts.EmitResult) | undefined;
    if (cache) {
      options.incremental = true;
      options.tsBuildInfoFile = join(cache, `${project}.tsbuildinfo`);
      const host = ts.createIncrementalCompilerHost(options);
      host.writeFile = (file, content) => writeCache(cache, resolve(file), content);
      const builder = ts.createIncrementalProgram({ rootNames: parsed.fileNames, options, host });
      program = builder.getProgram();
      emit = () => builder.emit();
    } else {
      program = ts.createProgram(parsed.fileNames, options);
    }
    const diagnostics = [...ts.getPreEmitDiagnostics(program)];
    if (!diagnostics.length && emit) diagnostics.push(...emit().diagnostics);
    return {
      project, roots: parsed.fileNames.map((file) => relative(canonical, file)).sort(), exports,
      files: program.getSourceFiles().map((file) => file.fileName).filter((file) =>
        inside(file, canonical) && !inside(file, join(canonical, "node_modules")))
        .map((file) => relative(canonical, file)).sort(),
      diagnostics,
    };
  });
}

const ignored = new Set(["node_modules", ".git", ".migration-results", "coverage", "npm", "jsdocs", "generated", "fixtures", "results"]);
function copyGraph(from: string, to: string) {
  const value = lstatSync(from);
  requireCondition(!value.isSymbolicLink(), "Negative-control source graph must not contain symlinks");
  if (value.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (ignored.has(entry.name) || from.endsWith(`${sep}tests`) && entry.name === "cloudflare") continue;
      if (entry.isDirectory() || /\.(?:ts|mjs|json)$/.test(entry.name)) copyGraph(join(from, entry.name), join(to, entry.name));
    }
  } else {
    requireCondition(value.isFile(), "Negative-control inputs must be regular files");
    copyFileSync(from, to);
  }
}
/** A fixture-free scratch mirror exercises real config discovery, never repo writes. */
export function negativeControls(root = repository): { overload: number; libraryBuiltins: number; included: string[] } {
  const canonical = realpathSync(root);
  const temporaryParent = realpathSync(tmpdir());
  requireCondition(!inside(temporaryParent, canonical),
    "Negative-control scratch parent must be outside the repository");
  const scratch = mkdtempSync(join(temporaryParent, "yf-typecheck-negative-"));
  try {
    const mirror = join(scratch, "project");
    mkdirSync(mirror);
    for (const name of ["src", "bin", "scripts", "tests"]) copyGraph(join(canonical, name), join(mirror, name));
    for (const entry of readdirSync(canonical)) {
      if (/^tsconfig(?:\.[\w-]+)?\.json$/.test(entry) || ["deno.json", "package.json", ".bun-version", "release.config.mjs"].includes(entry)) {
        copyGraph(join(canonical, entry), join(mirror, entry));
      }
    }
    symlinkSync(join(canonical, "node_modules"), join(mirror, "node_modules"), "dir");
    const baseline = checkProjects(mirror);
    requireCondition(baseline.every((result) => !result.diagnostics.length),
      "Negative-control scratch baseline failed:\n" + baseline.map((r) => ts.formatDiagnostics(r.diagnostics, diagnosticHost(mirror))).join("\n"));
    const optionsFile = join(mirror, "src/modules/options.type.test.ts");
    const original = readFileSync(optionsFile, "utf8");
    requireCondition(original.includes("@ts-expect-error"), "Actual options overload directives are missing");
    writeFileSync(optionsFile, original.replaceAll("@ts-expect-error", "@removed-expect-error"));
    const overload = checkProjects(mirror, ["tools"])[0].diagnostics.filter((diagnostic) =>
      diagnostic.code === 2322 && diagnostic.file?.fileName === optionsFile).length;
    requireCondition(overload > 0, "Removing actual options overload directives did not produce TS2322");
    writeFileSync(optionsFile, original);
    const controls = [
      ["library", "src/typecheck-negative.ts"], ["library", "bin/typecheck-negative.ts"],
      ["tools", "scripts/typecheck-negative.ts"], ["tools", "tests/typecheck-negative.ts"],
      ["tools", "scripts/typecheck-negative.mjs"],
      ["tools", "scripts/capture-get-crumb-fixtures.ts"],
      ["tools", "scripts/capture-get-crumb-fixtures.test.ts"],
      ["tools", "scripts/capture-get-crumb-cli.test.ts"],
      ["tools", "src/lib/getCrumb.geo.test.ts"],
    ] as const;
    const toolRoots = baseline.find((result) => result.project === "tools")!.roots;
    for (const [, file] of controls.slice(5)) requireCondition(toolRoots.includes(file),
      `Ported capture input is missing from tooling roots: ${file}`);
    for (const [, file] of controls) {
      const target = join(mirror, file);
      const prefix = stat(target) ? readFileSync(target, "utf8") + "\n" : "";
      writeFileSync(target, prefix + (file.endsWith(".mjs")
        ? '/** @type {number} */ export const __typecheckRejected = "invalid";\n'
        : 'export const __typecheckRejected: number = "invalid";\n'));
    }
    writeFileSync(join(mirror, "src/typecheck-negative.ts"),
      'export const rejected: number = "invalid";\nexport const future = [3, 1].toSorted();\n');
    const invalid = checkProjects(mirror);
    const libraryBuiltins = invalid[0].diagnostics.filter((diagnostic) =>
      diagnostic.code === 2550 && diagnostic.file?.fileName === join(mirror, "src/typecheck-negative.ts")).length;
    requireCondition(libraryBuiltins > 0, "Production ES2022 libraries accepted a future builtin");
    for (const [project, file] of controls) requireCondition(invalid.some((result) =>
      result.project === project && result.diagnostics.some((diagnostic) =>
        diagnostic.code === 2322 && diagnostic.file?.fileName === join(mirror, file))),
      `Included-file negative control was not rejected: ${file}`);
    return { overload, libraryBuiltins, included: controls.map(([, file]) => file) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export interface TypecheckOptions { mode: "check" | "incremental" | "negative" | "list" | "help"; selected: Project[] }
export function parseArguments(args: string[]): TypecheckOptions {
  let mode: TypecheckOptions["mode"] = "check";
  let project: Project | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (["--incremental", "--negative", "--list", "--help"].includes(argument)) {
      requireCondition(mode === "check", "Choose one typecheck mode");
      mode = argument.slice(2) as Exclude<TypecheckOptions["mode"], "check">;
    } else if (argument === "--project") {
      const value = args[++index];
      requireCondition(!project && (value === "library" || value === "tools"), "Expected one --project library|tools");
      project = value;
    } else throw new Error(`Unknown typecheck option: ${argument}`);
  }
  requireCondition(!(mode === "negative" && project), "Negative controls require both projects");
  return { mode, selected: project ? [project] : [...projects] };
}
export function typecheckMain(args: string[], root = repository): number {
  let options: TypecheckOptions;
  try { options = parseArguments(args); }
  catch (error) { console.error(error instanceof Error ? error.message : "Invalid typecheck options"); return 2; }
  if (options.mode === "help") { console.log(help); return 0; }
  try {
    const pin = readFileSync(join(root, ".bun-version"), "utf8").trim();
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    requireCondition(process.versions.bun === pin, `Typechecking requires the pinned Bun ${pin}`);
    requireCondition(ts.version === manifest.devDependencies.typescript, "Installed TypeScript does not match its exact root pin");
    console.log(`Selected compiler projects: ${options.selected.join(", ")}; Workers uses its independent gate.`);
    console.log("Policy: historical experiment drivers/configs and fixture/result data are separate; --list shows exact roots and exclusions.");
    if (options.mode === "negative") {
      console.log(JSON.stringify({ negativeControls: negativeControls(root), typescript: ts.version }));
      return 0;
    }
    if (options.mode === "list") {
      for (const project of options.selected) {
        const parsed = configuration(root, project);
        console.log(JSON.stringify({ project, roots: parsed.fileNames.map((file) => relative(root, file)).sort(),
          exports: project === "library" ? productionExports(root, parsed.fileNames) : [], excluded: parsed.raw.exclude ?? [] }));
      }
      return 0;
    }
    const results = checkProjects(root, options.selected, options.mode === "incremental");
    for (const result of results) {
      if (result.diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics, diagnosticHost(root)));
      console.log(`${result.project}: ${result.roots.length} roots, ${result.files.length} project files, ${result.exports.length} consumer exports; ${result.diagnostics.length} diagnostics`);
    }
    return results.some((result) => result.diagnostics.length) ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Typechecking failed");
    return 1;
  }
}
function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isMain()) process.exitCode = typecheckMain(process.argv.slice(2));
