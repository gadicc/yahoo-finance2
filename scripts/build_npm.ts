/** Build the public npm package without a runtime shim or bundler. */
import * as ts from "typescript";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const repository = realpathSync(
  fileURLToPath(new URL("../", import.meta.url)),
);
const markerName = ".yahoo-finance2-build.json";
const marker = '{"builder":"yahoo-finance2/scripts/build_npm.ts","format":1}\n';
const outputEntries = new Set([
  markerName,
  "package.json",
  "esm",
  "script",
  "LICENSE",
  "README.md",
  "skills",
]);
const help =
  "Usage: bun scripts/build_npm.ts [--out-dir NEW_OR_EMPTY_DIRECTORY] [--version SEMVER]\n";

export interface BuildOptions {
  outDir?: string;
  version?: string;
}

export function parseBuildArgs(args: string[]): BuildOptions {
  const options: BuildOptions = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument !== "--out-dir" && argument !== "--version") {
      throw new Error(`Unknown build option: ${argument}`);
    }
    const value = args[++index];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${argument}`);
    const key = argument === "--out-dir" ? "outDir" : "version";
    if (options[key] !== undefined)
      throw new Error(`Duplicate build option: ${argument}`);
    options[key] = value;
  }
  return options;
}

/** Validate before compiling, and again before any output replacement. */
export function validateOutput(output: string, root = repository): void {
  const absolute = path.resolve(output);
  const canonicalRoot = realpathSync(root);
  const defaultOutput = path.join(canonicalRoot, "npm");
  const parent = path.dirname(absolute);
  if (realpathSync(parent) !== parent)
    throw new Error("Output parents must not contain symlinks");
  if (
    absolute !== defaultOutput &&
    (absolute === canonicalRoot ||
      absolute.startsWith(canonicalRoot + path.sep) ||
      canonicalRoot.startsWith(absolute + path.sep))
  )
    throw new Error(
      "Custom output must be outside the repository and fixtures",
    );
  if (!existsSync(absolute)) {
    // existsSync follows links; lstat also rejects a dangling symlink.
    try {
      lstatSync(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    throw new Error("Output must not be a symlink");
  }
  const status = lstatSync(absolute);
  if (
    status.isSymbolicLink() ||
    !status.isDirectory() ||
    realpathSync(absolute) !== absolute
  ) {
    throw new Error("Output must be a real directory, never a symlink");
  }
  const entries = readdirSync(absolute);
  if (!entries.length) return;
  if (absolute !== defaultOutput)
    throw new Error(
      "Custom output must be new or empty; existing files are preserved",
    );
  const ownership = path.join(absolute, markerName);
  if (
    !existsSync(ownership) ||
    lstatSync(ownership).isSymbolicLink() ||
    !lstatSync(ownership).isFile() ||
    readFileSync(ownership, "utf8") !== marker ||
    entries.some((entry) => !outputEntries.has(entry))
  ) {
    throw new Error(
      "Refusing to replace unrecognized npm output; move it aside explicitly first",
    );
  }
}

function inside(file: string, directory: string): boolean {
  return file === directory || file.startsWith(directory + path.sep);
}

/** No repository input may resolve through a link, including its parent dirs. */
function ownedInput(
  file: string,
  allowDirectory = false,
  allowMissing = false,
) {
  const absolute = path.resolve(repository, file);
  if (!inside(absolute, repository)) {
    throw new Error(`Build input is outside the repository: ${absolute}`);
  }
  const components = path
    .relative(repository, absolute)
    .split(path.sep)
    .filter(Boolean);
  let current = repository;
  for (let index = 0; index < components.length; index++) {
    current = path.join(current, components[index]);
    let status: ReturnType<typeof lstatSync>;
    try {
      status = lstatSync(current);
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT")
        return;
      throw error;
    }
    if (status.isSymbolicLink())
      throw new Error(`Refusing a symlink build input: ${current}`);
    const final = index === components.length - 1;
    if (
      final
        ? !(status.isFile() || (allowDirectory && status.isDirectory()))
        : !status.isDirectory()
    ) {
      throw new Error(`Refusing a nonregular build input: ${current}`);
    }
  }
}

/** Dependencies may use package-manager links; that exemption never covers src/. */
function compilerHost(options: ts.CompilerOptions): ts.CompilerHost {
  const dependencyDirectory = path.join(repository, "node_modules");
  const dependencyRoots = new Set<string>([realpathSync(dependencyDirectory)]);
  function dependencyRoot(file: string) {
    try {
      const canonical = realpathSync(file);
      if (!lstatSync(canonical).isDirectory()) return;
      dependencyRoots.add(canonical);
      // Linked packages resolve their own dependencies beside their physical path.
      const components = canonical.split(path.sep);
      const index = components.lastIndexOf("node_modules");
      if (index >= 0)
        dependencyRoots.add(components.slice(0, index + 1).join(path.sep));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  for (const entry of readdirSync(dependencyDirectory, {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(dependencyDirectory, entry.name);
    if (entry.name.startsWith("@")) {
      for (const name of readdirSync(file))
        dependencyRoot(path.join(file, name));
    } else dependencyRoot(file);
  }
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => repository;
  const read = host.readFile.bind(host);
  const realpath = host.realpath?.bind(host);
  function validate(file: string, allowDirectory: boolean) {
    const absolute = path.resolve(repository, file);
    if (
      inside(absolute, repository) &&
      !inside(absolute, dependencyDirectory)
    ) {
      ownedInput(absolute, allowDirectory, true);
    } else if (
      !inside(absolute, dependencyDirectory) &&
      ![...dependencyRoots].some((directory) => inside(absolute, directory))
    ) {
      throw new Error(
        `Build input is outside the repository and dependencies: ${absolute}`,
      );
    }
  }
  host.readFile = (file) => {
    validate(file, false);
    return read(file);
  };
  if (realpath)
    host.realpath = (file) => {
      validate(file, true);
      return realpath(file);
    };
  return host;
}

function moduleSpecifier(value: ts.Expression): ts.Expression {
  return ts.isStringLiteral(value) &&
    /^\.\.?\//.test(value.text) &&
    value.text.endsWith(".ts")
    ? ts.factory.createStringLiteral(value.text.slice(0, -3) + ".js")
    : value;
}

/** Shared by JS and declarations; change module references, never arbitrary strings. */
export function rewriteModules(
  commonJS: boolean,
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node)) {
        return ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          moduleSpecifier(node.moduleSpecifier),
          commonJS ? undefined : node.attributes,
        );
      }
      if (ts.isExportDeclaration(node)) {
        return ts.factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          node.moduleSpecifier && moduleSpecifier(node.moduleSpecifier),
          commonJS ? undefined : node.attributes,
        );
      }
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        return ts.factory.updateImportTypeNode(
          node,
          ts.factory.createLiteralTypeNode(
            moduleSpecifier(node.argument.literal) as ts.StringLiteral,
          ),
          commonJS ? undefined : node.attributes,
          node.qualifier,
          node.typeArguments,
          node.isTypeOf,
        );
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        return ts.factory.updateCallExpression(
          node,
          node.expression,
          node.typeArguments,
          node.arguments.map((argument, index) =>
            index === 0 ? moduleSpecifier(argument) : argument,
          ),
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (source) => ts.visitNode(source, visit) as ts.SourceFile;
  };
}

function json(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function copyTree(from: string, to: string) {
  ownedInput(from, true);
  const status = lstatSync(from);
  if (status.isSymbolicLink())
    throw new Error(`Refusing to package a symlink: ${from}`);
  if (status.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from).sort())
      copyTree(path.join(from, entry), path.join(to, entry));
  } else if (status.isFile()) {
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    chmodSync(to, 0o644);
  } else throw new Error(`Refusing to package a special file: ${from}`);
}

function normalizeModes(directory: string) {
  chmodSync(directory, 0o755);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) normalizeModes(file);
    else if (entry.isFile()) chmodSync(file, 0o644);
    else throw new Error("Unexpected special file in staged package");
  }
}

function schemaFiles(directory: string): string[] {
  ownedInput(directory, true);
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Refusing a symlink schema input: ${file}`);
    if (entry.isDirectory()) result.push(...schemaFiles(file));
    else if (entry.name.endsWith(".schema.json")) {
      ownedInput(file);
      result.push(file);
    }
  }
  return result;
}

export function buildNpm(options: BuildOptions = {}): string {
  const output = path.resolve(options.outDir ?? path.join(repository, "npm"));
  validateOutput(output);
  const metadataFile = path.join(repository, "deno.json");
  ownedInput(metadataFile);
  const sourceMetadata = JSON.parse(readFileSync(metadataFile, "utf8"));
  const version = options.version ?? sourceMetadata.version;
  const semanticVersion =
    typeof version === "string" &&
    version.match(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    );
  if (
    !semanticVersion ||
    semanticVersion[4]?.split(".").some((part) => /^0\d+$/.test(part))
  ) {
    throw new Error("Build version must be a semantic version");
  }
  const publicEntries = Object.entries(sourceMetadata.exports) as [
    string,
    string,
  ][];
  const roots = [
    ...new Set(publicEntries.map(([, file]) => path.resolve(repository, file))),
  ];
  const bins = ["yahoo-finance", "yahoo-finance-mcp"].map((name) =>
    path.join(repository, "bin", name + ".ts"),
  );
  for (const file of [...roots, ...bins]) ownedInput(file);
  const staging = mkdtempSync(
    path.join(path.dirname(output), ".yf-npm-build-"),
  );
  try {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      rootDir: repository,
      outDir: path.join(staging, "esm"),
      declaration: true,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      rewriteRelativeImportExtensions: true,
      lib: [
        "lib.esnext.d.ts",
        "lib.dom.d.ts",
        "lib.dom.iterable.d.ts",
        "lib.dom.asynciterable.d.ts",
      ],
      types: ["node"],
      typeRoots: [path.join(repository, "node_modules", "@types")],
      newLine: ts.NewLineKind.LineFeed,
      ignoreDeprecations: "6.0",
    };
    const program = ts.createProgram(
      [...roots, ...bins],
      compilerOptions,
      compilerHost(compilerOptions),
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => repository,
          getNewLine: () => "\n",
        }),
      );
    for (const format of ["esm", "script"] as const) {
      const commonJS = format === "script";
      const formatOptions = {
        ...compilerOptions,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        outDir: path.join(staging, format),
      };
      const instance = commonJS
        ? ts.createProgram(roots, formatOptions, compilerHost(formatOptions))
        : program;
      const result = instance.emit(undefined, undefined, undefined, undefined, {
        before: [rewriteModules(commonJS)],
        afterDeclarations: [
          rewriteModules(commonJS) as ts.TransformerFactory<
            ts.SourceFile | ts.Bundle
          >,
        ],
      });
      if (result.emitSkipped || result.diagnostics.length)
        throw new Error("TypeScript failed to emit the npm package");
      json(path.join(staging, format, "package.json"), {
        type: commonJS ? "commonjs" : "module",
      });
      // Runtime metadata is deliberately small; do not ship development tasks/import maps.
      json(path.join(staging, format, "deno.json"), {
        name: sourceMetadata.name,
        version,
      });
      for (const file of schemaFiles(path.join(repository, "src"))) {
        copyTree(
          file,
          path.join(staging, format, path.relative(repository, file)),
        );
      }
    }
    const exports = Object.fromEntries(
      publicEntries.map(([name, source]) => {
        const target = source.replace(/^\.\//, "").replace(/\.ts$/, ".js");
        return [
          name,
          Object.fromEntries(
            ["import", "require"].map((condition) => {
              const format = condition === "import" ? "esm" : "script";
              return [
                condition,
                {
                  types: `./${format}/${target.replace(/\.js$/, ".d.ts")}`,
                  default: `./${format}/${target}`,
                },
              ];
            }),
          ),
        ];
      }),
    );
    const dependency = (name: string) => {
      const mapped = sourceMetadata.imports[name];
      const prefix = `npm:${name}@`;
      if (typeof mapped !== "string" || !mapped.startsWith(prefix))
        throw new Error(`Unsupported dependency mapping: ${name}`);
      return mapped.slice(prefix.length);
    };
    const sdk =
      sourceMetadata.imports["@modelcontextprotocol/sdk/client/index.js"];
    if (!/^npm:@modelcontextprotocol\/sdk@[^/]+\/client\/index\.js$/.test(sdk))
      throw new Error("Unsupported SDK dependency mapping");
    json(path.join(staging, "package.json"), {
      name: "yahoo-finance2",
      version,
      description: "JS API for Yahoo Finance",
      author: "Gadi Cohen <dragon@wastelands.net>",
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/gadicc/yahoo-finance2.git",
      },
      bugs: { url: "https://github.com/gadicc/yahoo-finance2/issues" },
      keywords: [
        "yahoo",
        "finance",
        "financial",
        "data",
        "stock",
        "price",
        "quote",
        "historical",
        "eod",
        "end-of-day",
        "client",
        "library",
        "agent-skill",
        "mcp-server",
      ],
      engines: { node: ">=22.0.0" },
      main: "./script/src/index.js",
      module: "./esm/src/index.js",
      types: "./esm/src/index.d.ts",
      exports,
      bin: {
        "yahoo-finance2": "./esm/bin/yahoo-finance.js",
        "yahoo-finance": "./esm/bin/yahoo-finance.js",
        "yahoo-finance-mcp": "./esm/bin/yahoo-finance-mcp.js",
      },
      files: ["esm/", "script/", "LICENSE", "README.md", "skills/"],
      dependencies: {
        "tough-cookie": dependency("tough-cookie"),
        "tough-cookie-file-store": dependency("tough-cookie-file-store"),
        "@modelcontextprotocol/sdk": sdk
          .slice("npm:@modelcontextprotocol/sdk@".length)
          .replace(/\/client\/index\.js$/, ""),
        zod: dependency("zod"),
        "@types/json-schema": dependency("@types/json-schema"),
      },
    });
    for (const name of ["LICENSE", "README.md", "skills"])
      copyTree(path.join(repository, name), path.join(staging, name));
    writeFileSync(path.join(staging, markerName), marker);
    normalizeModes(staging);
    for (const name of ["yahoo-finance", "yahoo-finance-mcp"])
      chmodSync(path.join(staging, "esm/bin", name + ".js"), 0o755);
    validateOutput(output);
    if (existsSync(output)) {
      if (output === path.join(repository, "npm") && readdirSync(output).length)
        rmSync(output, { recursive: true });
      else rmdirSync(output); // Never recursively remove custom output, even after a race.
    }
    renameSync(staging, output);
    return output;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length === 3 && process.argv[2] === "--help")
      process.stdout.write(help);
    else
      console.log(
        `Built npm package at ${buildNpm(parseBuildArgs(process.argv.slice(2)))}`,
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
