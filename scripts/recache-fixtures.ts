import { walk } from "@std/fs/walk";

/** Fingerprint contents so the report excludes local edits made before the run. */
export async function snapshotFixtures(
  root = "tests/fixtures/http",
): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  for await (
    const entry of walk(root, { includeDirs: false, match: [/\.json$/] })
  ) {
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", await Deno.readFile(entry.path)),
    );
    snapshot.set(
      entry.path,
      [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
  }
  return snapshot;
}

/** Report differences without restoring, deleting, or staging any fixtures. */
export function fixtureChanges(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path))
    .sort().map((path) =>
      `${
        !before.has(path) ? "added" : !after.has(path) ? "removed" : "updated"
      }: ${path}`
    );
}
