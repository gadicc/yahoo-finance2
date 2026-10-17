import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { sourceProvenance } from "./provenance.ts";

const require = createRequire(import.meta.url);
const typescriptRoot = realpathSync(
  resolve(dirname(require.resolve("typescript")), ".."),
);
const digest = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const inside = (file: string, root: string) =>
  file === root || file.startsWith(root + sep);
const stable = (value: unknown): string =>
  JSON.stringify(value, (key, item) =>
    key === "configFile"
      ? undefined
      : item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
  );
export interface InputRecord {
  path: string;
  sha256: string;
}
interface Lookup {
  file: string;
  kind: "file" | "directory";
  exists: boolean;
}
export interface InputSnapshot {
  fingerprint: string;
  inventory: {
    configurations: InputRecord[];
    optionalTsdocPresent: boolean;
    roots: string[];
    program: InputRecord[];
    metadata: InputRecord[];
    trackedLookupCount: number;
  };
  roots: string[];
  sources: Map<string, string>;
  options: string;
  typedocOverrides: string[];
  files: Set<string>;
  trustedRoots: string[];
}
interface DirectoryRead {
  file: string;
  entries: string[];
}
interface Cache {
  signature: string;
  projectReads: Map<string, string>;
  lookups: Lookup[];
  directories: DirectoryRead[];
  snapshot: InputSnapshot;
}
const caches = new Map<string, Cache>();

/** Discover the supported configuration closure and the exact selected TS program. */
export function inputSnapshot(directory: string): InputSnapshot {
  const root = realpathSync(directory),
    nodeModules = join(root, "node_modules");
  const installed = existsSync(nodeModules)
    ? realpathSync(nodeModules)
    : undefined;
  const trusted = (file: string) =>
    inside(file, typescriptRoot) ||
    inside(file, nodeModules) ||
    (!!installed && inside(file, installed));
  const label = (file: string) =>
    inside(file, root)
      ? relative(root, file).replaceAll("\\", "/")
      : installed && inside(file, installed)
        ? `node_modules/${relative(installed, file).replaceAll("\\", "/")}`
        : inside(file, typescriptRoot)
          ? `<typescript>/${relative(typescriptRoot, file).replaceAll("\\", "/")}`
          : file;
  const allowedRead = (file: string) => {
    if (!inside(file, root) && !trusted(file))
      throw new Error(
        `Unsupported documentation input outside the checkout/dependency graph: ${file}`,
      );
    if (
      inside(file, root) &&
      !inside(file, nodeModules) &&
      realpathSync(file) !== file
    )
      throw new Error(
        `Documentation project inputs must not use symlinks: ${file}`,
      );
  };
  const reads = new Map<string, string>(),
    lookups = new Map<string, Lookup>(),
    directories = new Map<string, DirectoryRead>();
  const read = (name: string): string | undefined => {
    const file = resolve(name);
    if (!ts.sys.fileExists(file)) {
      if (!trusted(file))
        lookups.set(`file:${file}`, { file, kind: "file", exists: false });
      return undefined;
    }
    allowedRead(file);
    reads.set(file, digest(readFileSync(file)));
    const text = ts.sys.readFile(file);
    return text;
  };
  const configs = new Set<string>(),
    overrides = new Set<string>(),
    active = new Set<string>();
  const configuration = (name: string, tsdoc = false): void => {
    const file = resolve(name);
    if (!inside(file, root) || inside(file, nodeModules))
      throw new Error(
        `Documentation configuration must be repository-local JSON/JSONC: ${file}`,
      );
    if (active.has(file))
      throw new Error(
        `Circular documentation configuration extends: ${label(file)}`,
      );
    if (configs.has(file)) return;
    active.add(file);
    configs.add(file);
    const parsed = ts.readConfigFile(file, read);
    if (parsed.error)
      throw new Error(
        `Documentation configuration ${label(file)}: TS${parsed.error.code}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, " ").slice(0, 1000)}`,
      );
    const data = parsed.config as {
      extends?: unknown;
      references?: unknown[];
      typedocOptions?: Record<string, unknown>;
    };
    if (!tsdoc && data.references?.length)
      throw new Error(
        `Documentation project references are unsupported: ${label(file)}; use the single library project`,
      );
    if (!tsdoc && data.typedocOptions)
      for (const key of Object.keys(data.typedocOptions))
        overrides.add(`${label(file)}:${key}`);
    if (data.extends !== undefined) {
      const parents = Array.isArray(data.extends)
        ? data.extends
        : tsdoc
          ? []
          : [data.extends];
      if (tsdoc && !Array.isArray(data.extends))
        throw new Error(
          `TSDoc extends must be an array of explicit local JSON paths: ${label(file)}`,
        );
      for (const parent of parents) {
        if (
          typeof parent !== "string" ||
          !/\.jsonc?$/.test(parent) ||
          !(parent.startsWith(".") || isAbsolute(parent))
        ) {
          throw new Error(
            `Unsupported documentation extends in ${label(file)}: use an explicit repository-local .json/.jsonc path`,
          );
        }
        const expected = resolve(dirname(file), parent);
        // TSConfigReader separately uses Node resolution for TypeDoc/TSDoc metadata.
        // Explicit local JSON paths make both resolutions unambiguous.
        let resolved: string;
        try {
          resolved = createRequire(file).resolve(parent);
        } catch {
          throw new Error(
            `Cannot resolve documentation extends ${parent} from ${label(file)}`,
          );
        }
        if (resolve(resolved) !== expected)
          throw new Error(
            `Ambiguous TypeScript/Node documentation extends: ${parent}`,
          );
        configuration(resolved, tsdoc);
      }
    }
    active.delete(file);
  };
  const library = join(root, "tsconfig.library.json");
  configuration(library);
  const tsdoc = join(root, "tsdoc.json"),
    optionalTsdocPresent = ts.sys.fileExists(tsdoc);
  if (optionalTsdocPresent) configuration(tsdoc, true);
  const baseRecords: InputRecord[] = [];
  const baseFiles = new Set<string>();
  const addBase = (file: string) => {
    const text = read(file);
    if (text === undefined)
      throw new Error(`Missing documentation input: ${label(file)}`);
    baseFiles.add(file);
    baseRecords.push({ path: label(file), sha256: reads.get(file) ?? "" });
  };
  const visit = (part: string) => {
    for (const entry of readdirSync(join(root, part), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(part, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) addBase(join(root, file));
      else
        throw new Error(
          `Refusing documentation input link or special file: ${file}`,
        );
    }
  };
  visit("src");
  visit("scripts/docs");
  for (const name of [
    "scripts/docs.ts",
    "deno.json",
    "package.json",
    "bun.lock",
  ])
    addBase(join(root, name));
  const parseHost: ts.ParseConfigFileHost = {
    ...ts.sys,
    readFile: read,
    getCurrentDirectory: () => root,
    onUnRecoverableConfigFileDiagnostic(error) {
      throw new Error(
        `Documentation configuration: TS${error.code}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
      );
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(library, {}, parseHost);
  if (!parsed)
    throw new Error("Cannot parse documentation compiler configuration");
  if (parsed.projectReferences?.length)
    throw new Error(
      "Documentation project references are unsupported; use the single library project",
    );
  const options = { ...parsed.options, noEmit: true };
  delete options.emitDeclarationOnly;
  const roots = parsed.fileNames.length
    ? [...parsed.fileNames]
    : Object.values(
        (
          JSON.parse(readFileSync(join(root, "deno.json"), "utf8")) as {
            exports: Record<string, string>;
          }
        ).exports,
      ).map((file) => resolve(root, file));
  const configurationRecords = [...configs]
    .sort()
    .map((file) => ({ path: label(file), sha256: reads.get(file) ?? "" }));
  const signature = digest(
    stable({
      baseRecords,
      configurationRecords,
      optionalTsdocPresent,
      roots,
      options,
      provenance: sourceProvenance(root),
    }),
  );
  const previous = caches.get(root);
  if (
    previous?.signature === signature &&
    [...previous.projectReads].every(([file, hash]) => {
      try {
        allowedRead(file);
        return digest(readFileSync(file)) === hash;
      } catch {
        return false;
      }
    }) &&
    previous.lookups.every(
      ({ file, kind, exists }) =>
        (kind === "file"
          ? ts.sys.fileExists(file)
          : ts.sys.directoryExists(file)) === exists,
    ) &&
    previous.directories.every(
      ({ file, entries }) =>
        stable(ts.sys.getDirectories(file).sort()) === stable(entries),
    )
  )
    return previous.snapshot;
  const host = ts.createCompilerHost(options);
  host.readFile = read;
  host.getCurrentDirectory = () => root;
  host.fileExists = (name) => {
    const file = resolve(name),
      exists = ts.sys.fileExists(file);
    if (!trusted(file))
      lookups.set(`file:${file}`, { file, kind: "file", exists });
    return exists;
  };
  host.directoryExists = (name) => {
    const file = resolve(name),
      exists = ts.sys.directoryExists(file);
    if (!trusted(file))
      lookups.set(`directory:${file}`, { file, kind: "directory", exists });
    return exists;
  };
  host.getDirectories = (name) => {
    const file = resolve(name),
      entries = ts.sys.getDirectories(file);
    if (!trusted(file))
      directories.set(file, { file, entries: [...entries].sort() });
    return entries;
  };
  const program = ts.createProgram({ rootNames: roots, options, host });
  const sources = new Map<string, string>();
  for (const source of program.getSourceFiles()) {
    const file = resolve(source.fileName);
    allowedRead(file);
    sources.set(file, digest(source.text));
  }
  const records = (files: Iterable<string>) =>
    [...files].sort().map((file) => ({
      path: label(file),
      sha256: reads.get(file) ?? digest(readFileSync(file)),
    }));
  const programRecords = records(sources.keys()),
    metadata = records(
      [...reads.keys()].filter(
        (file) => !sources.has(file) && !configs.has(file),
      ),
    );
  const inventory = {
    configurations: configurationRecords,
    optionalTsdocPresent,
    roots: roots.map(label).sort(),
    program: programRecords,
    metadata,
    trackedLookupCount: lookups.size,
  };
  const snapshot: InputSnapshot = {
    fingerprint: digest(stable({ signature, inventory })),
    inventory,
    roots: roots.map((file) => resolve(file)).sort(),
    sources,
    options: stable(options),
    typedocOverrides: [...overrides].sort(),
    files: new Set(reads.keys()),
    trustedRoots: [
      nodeModules,
      typescriptRoot,
      ...(installed ? [installed] : []),
    ],
  };
  caches.set(root, {
    signature,
    // Base/config bytes are already bound by signature; only additional project
    // program/metadata reads need a second warm check (not the frozen graph).
    projectReads: new Map(
      [...reads].filter(
        ([file]) =>
          !trusted(file) && !baseFiles.has(file) && !configs.has(file),
      ),
    ),
    lookups: [...lookups.values()],
    directories: [...directories.values()],
    snapshot,
  });
  return snapshot;
}

/** Bind the fingerprint to the very program objects that TypeDoc will convert. */
export function verifyPrograms(
  snapshot: InputSnapshot,
  programs: readonly ts.Program[],
) {
  if (programs.length !== 1)
    throw new Error(
      "Unsupported documentation program closure: expected one library program",
    );
  const program = programs[0];
  if (!program) throw new Error("Missing documentation compiler program");
  if (
    stable(program.getCompilerOptions()) !== snapshot.options ||
    stable(
      program
        .getRootFileNames()
        .map((file) => resolve(file))
        .sort(),
    ) !== stable(snapshot.roots)
  )
    throw new Error(
      "TypeDoc compiler options/roots differ from fingerprinted inputs",
    );
  const actual = program.getSourceFiles();
  if (
    actual.length !== snapshot.sources.size ||
    actual.some(
      (source) =>
        snapshot.sources.get(resolve(source.fileName)) !== digest(source.text),
    )
  )
    throw new Error(
      "TypeDoc resolved program differs from fingerprinted source/declaration inputs",
    );
}

export function verifyAdditionalInput(
  snapshot: InputSnapshot,
  filename: string,
) {
  const file = resolve(filename);
  if (
    !snapshot.files.has(file) &&
    !snapshot.trustedRoots.some((root) => inside(file, root))
  ) {
    throw new Error(
      `Unsupported additional TypeDoc file input: ${file}; keep documentation in selected source comments or extend the owned input collector`,
    );
  }
}
