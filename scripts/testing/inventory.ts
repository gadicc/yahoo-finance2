import { type Dirent, lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const excludedDirectories: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".migration-results",
  "coverage",
  "npm",
  "jsdocs",
  "generated",
  "fixtures",
]);

/** Sorted repository paths; no shell globbing, symlink traversal, or Workers. */
export function inventory(root: string): string[] {
  const files: string[] = [];
  function visit(directory: string) {
    let entries: Dirent<string>[];
    try {
      if (lstatSync(directory).isSymbolicLink()) return;
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (
        ["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      const name = relative(root, path).split(sep).join("/");
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name) || name === "tests/cloudflare")
          continue;
        visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        files.push(name);
      }
    }
  }
  for (const directory of ["src", "tests", "scripts"]) {
    visit(resolve(root, directory));
  }
  return files.sort();
}

export function select(
  root: string,
  files: string[],
  paths: string[],
  filter?: string,
) {
  const selected = paths.length ? new Set<string>() : new Set(files);
  for (const path of paths) {
    const absolute = resolve(root, path);
    const name = relative(root, absolute).split(sep).join("/");
    if (name.startsWith("../") || isAbsolute(name)) {
      throw new Error(`Test selection is outside the repository: ${path}`);
    }
    const comparison = (value: string) =>
      process.platform === "win32" ? value.toLowerCase() : value;
    const wanted = comparison(name);
    const matches = files.filter(
      (file) =>
        wanted === "" ||
        comparison(file) === wanted ||
        comparison(file).startsWith(wanted.replace(/\/$/, "") + "/"),
    );
    if (!matches.length) throw new Error(`No test files match: ${path}`);
    // Refuse selections that resolve through symlinks outside the inventory root.
    if (relative(realpathSync(absolute), absolute) !== "") {
      throw new Error(`Symlink test selections are unsupported: ${path}`);
    }
    for (const match of matches) selected.add(match);
  }
  const result = files.filter(
    (file) =>
      selected.has(file) && (filter === undefined || file.includes(filter)),
  );
  if (!result.length) throw new Error("No test files selected");
  return result;
}

/** Explicit trusted-development scope; the remaining tooling inventory stays strict. */
export const nativePortableTests: ReadonlySet<string> = new Set([
  "tests/harness.test.ts",
  "tests/recacheFetch.test.ts",
  "tests/recacheStats.test.ts",
  "tests/replayStore.test.ts",
  "scripts/native-replay.test.ts",
]);

export function nativeInventory(files: string[]): string[] {
  return files.filter(
    (file) => file.startsWith("src/") || nativePortableTests.has(file),
  );
}
