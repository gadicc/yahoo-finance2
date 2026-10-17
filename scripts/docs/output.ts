import {
  lstatSync,
  realpathSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  renameSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export const markerName = ".yahoo-finance2-docs.json";
export const marker = '{"tool":"yahoo-finance2/scripts/docs.ts","format":1}\n';
function stat(file: string) {
  try {
    return lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
function inside(file: string, parent: string) {
  return file === parent || file.startsWith(`${parent}${sep}`);
}
function regularTree(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name),
      value = lstatSync(file);
    if (value.isSymbolicLink())
      throw new Error(`Refusing documentation symlink: ${file}`);
    if (value.isDirectory()) regularTree(file);
    else if (!value.isFile() || value.nlink !== 1) {
      throw new Error(`Documentation must contain only regular files: ${file}`);
    }
  }
}

/** Only jsdocs/ may be used inside the checkout; foreign output is preserved. */
export function validateOutput(output: string, root: string): void {
  const target = resolve(output),
    canonicalRoot = realpathSync(root);
  if (realpathSync(dirname(target)) !== dirname(target)) {
    throw new Error(
      "Documentation output parent must be canonical, without symlinks",
    );
  }
  if (
    target !== join(canonicalRoot, "jsdocs") &&
    (inside(target, canonicalRoot) || inside(canonicalRoot, target))
  ) {
    throw new Error(
      "Custom documentation output must be outside the repository",
    );
  }
  const value = stat(target);
  if (!value) return;
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    realpathSync(target) !== target
  ) {
    throw new Error("Documentation output must be a real directory");
  }
  if (!readdirSync(target).length) return;
  const owner = join(target, markerName),
    ownership = stat(owner);
  if (
    !ownership?.isFile() ||
    ownership.isSymbolicLink() ||
    ownership.nlink !== 1 ||
    readFileSync(owner, "utf8") !== marker
  ) {
    throw new Error(
      "Refusing unowned documentation output; move it aside explicitly",
    );
  }
  regularTree(target);
}

/** Sibling staging ensures failures leave the previous successful build intact. */
export function outputTransaction(
  output: string,
  root: string,
  rename = renameSync,
) {
  validateOutput(output, root);
  const lock = `${output}.lock`;
  mkdirSync(lock, { mode: 0o700 });
  let staging: string;
  try {
    staging = mkdtempSync(join(dirname(output), ".yf-docs-"));
  } catch (error) {
    rmSync(lock, { recursive: true });
    throw error;
  }
  let published = false;
  let preserveBackup = false;
  return {
    staging,
    publish() {
      validateOutput(output, root);
      writeFileSync(join(staging, markerName), marker, {
        flag: "wx",
        mode: 0o600,
      });
      const backup = join(lock, "previous");
      const existed = !!stat(output);
      if (existed) rename(output, backup);
      try {
        rename(staging, output);
        published = true;
      } catch (error) {
        if (existed) {
          try {
            rename(backup, output);
          } catch (restoreError) {
            preserveBackup = true;
            throw new AggregateError(
              [error, restoreError],
              `Documentation publication and rollback failed; previous output preserved at ${backup}. Inspect it before recovery.`,
            );
          }
        }
        throw error;
      }
    },
    close() {
      if (!published) rmSync(staging, { recursive: true, force: true });
      if (!preserveBackup) rmSync(lock, { recursive: true, force: true });
    },
  };
}
