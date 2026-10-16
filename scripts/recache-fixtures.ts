import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

/** Read a named regular file without following a leaf symlink or hiding races. */
export async function readFixtureBytes(
  path: string,
  rejectHardlinks = false,
): Promise<Buffer> {
  if ((await realpath(path)) !== resolve(path)) {
    throw new Error("Fixture path must not contain symlink aliases");
  }
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || (rejectHardlinks && before.nlink !== 1)) {
      throw new Error("Fixture must be an unaliased regular file");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const named = await lstat(path);
    if (
      named.isSymbolicLink() ||
      named.dev !== before.dev ||
      named.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      (await realpath(path)) !== resolve(path)
    ) {
      throw new Error("Fixture changed while being read");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

/** Fingerprint current bytes, excluding symlink aliases and earlier local edits. */
export async function snapshotFixtures(
  root = "tests/fixtures/http",
): Promise<Map<string, string>> {
  const absolute = resolve(root);
  if (
    (await lstat(absolute)).isSymbolicLink() ||
    (await realpath(absolute)) !== absolute
  ) {
    throw new Error("Fixture root must not contain symlink aliases");
  }
  const snapshot = new Map<string, string>();
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          !(await lstat(path)).isDirectory() ||
          (await realpath(path)) !== resolve(path)
        ) {
          throw new Error("Fixture directory changed during traversal");
        }
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        snapshot.set(
          path,
          createHash("sha256")
            .update(await readFixtureBytes(path))
            .digest("hex"),
        );
      }
    }
  }
  await visit(root);
  return snapshot;
}

/** Report differences without restoring, deleting, or staging any fixtures. */
export function fixtureChanges(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path) !== after.get(path))
    .sort()
    .map(
      (path) =>
        `${!before.has(path) ? "added" : !after.has(path) ? "removed" : "updated"}: ${path}`,
    );
}
