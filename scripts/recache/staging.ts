import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { readFixtureBytes, snapshotFixtures } from "../recache-fixtures.ts";
import { fixtureRejectionReason } from "../check-recache-rate-limits.ts";
import { captureHosts } from "./broker.ts";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface FixtureStage {
  originalRoot: string;
  fixtureRoot: string;
  originals: Map<string, string>;
  baseline: Map<string, string>;
}

/** Copy current bytes, including earlier local edits, into a private capture tree. */
export async function stageFixtures(originalRoot: string, scratch: string): Promise<FixtureStage> {
  originalRoot = resolve(originalRoot);
  const originals = await snapshotFixtures(originalRoot);
  const fixtureRoot = join(scratch, "fixtures");
  await mkdir(fixtureRoot, { mode: 0o700 });
  const baseline = new Map<string, string>();
  for (const [path, hash] of originals) {
    const name = relative(originalRoot, path);
    const destination = join(fixtureRoot, name);
    const bytes = await readFixtureBytes(path, true);
    if (digest(bytes) !== hash) throw new Error("Fixture changed while staging");
    await mkdir(dirname(destination), { mode: 0o700, recursive: true });
    await writeFile(destination, bytes, { mode: 0o600, flag: "wx" });
    baseline.set(destination, hash);
  }
  return { originalRoot, fixtureRoot, originals, baseline };
}

export function protectedGenericFixture(name: string): boolean {
  return /\.(?:static|fake)\.json$/.test(name) || name.startsWith("getCrumb-geo-");
}

function validateCapture(bytes: Buffer, authFlow: boolean): string | undefined {
  try {
    const content = JSON.parse(bytes.toString("utf8"));
    const url = new URL(content.request.url);
    if (
      url.protocol !== "https:" || !captureHosts.has(url.hostname) ||
      url.username || url.password || (url.port && url.port !== "443")
    ) return "unexpected-host";
    return fixtureRejectionReason(content, authFlow);
  } catch {
    return "invalid-capture";
  }
}

async function unchangedDestination(stage: FixtureStage, destination: string): Promise<boolean> {
  if (await realpath(stage.originalRoot) !== stage.originalRoot) return false;
  if (await realpath(dirname(destination)) !== dirname(destination)) return false;
  const expected = stage.originals.get(destination);
  try {
    const metadata = await lstat(destination);
    if (!metadata.isFile() || metadata.nlink !== 1) return false;
    return expected !== undefined && digest(await readFixtureBytes(destination, true)) === expected;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return expected === undefined;
    return false;
  }
}

export interface PublishResult {
  published: number;
  rejected: string[];
}

/**
 * Publish validated staged files without touching earlier local changes. Each
 * destination is compared immediately before atomic replacement. Concurrent
 * hostile host mutation between comparison and rename is outside this contract.
 * Removed files are never propagated by a capture operation.
 */
export async function publishStage(stage: FixtureStage, profile?: string): Promise<PublishResult> {
  const after = await snapshotFixtures(stage.fixtureRoot);
  const paths = new Set([...stage.baseline.keys(), ...after.keys()]);
  const result: PublishResult = { published: 0, rejected: [] };
  if (profile) {
    const prefix = `getCrumb-geo-${profile}-`;
    if ((await readdir(stage.originalRoot)).some((name) => name.startsWith(prefix))) {
      return { published: 0, rejected: ["profile-already-exists"] };
    }
  }
  for (const path of [...paths].sort()) {
    if (stage.baseline.get(path) === after.get(path)) continue;
    const name = relative(stage.fixtureRoot, path);
    // FMC fixture ids are flat. Avoid publishing child-created directories or
    // filesystem traversal and apply this policy again outside the test process.
    if (
      basename(name) !== name || name.includes(sep) || name.includes("\\") ||
      (profile ? !name.startsWith(`getCrumb-geo-${profile}-`) : protectedGenericFixture(name))
    ) { result.rejected.push("protected-fixture"); continue; }
    if (!after.has(path)) { result.rejected.push("fixture-removal"); continue; }
    let bytes: Buffer;
    try { bytes = await readFixtureBytes(path, true); }
    catch { result.rejected.push("unsafe-staged-fixture"); continue; }
    if (digest(bytes) !== after.get(path)) { result.rejected.push("stage-changed"); continue; }
    const reason = validateCapture(bytes, !!profile);
    if (reason) { result.rejected.push(reason); continue; }
    const destination = join(stage.originalRoot, name);
    if (!await unchangedDestination(stage, destination)) {
      result.rejected.push("local-fixture-changed"); continue;
    }
    const temporary = join(stage.originalRoot, `.yf-capture-${randomUUID()}`);
    try {
      await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
      if (!await unchangedDestination(stage, destination)) {
        result.rejected.push("local-fixture-changed"); continue;
      }
      await rename(temporary, destination);
      // A later file can capture the same id. Preserve the newly published
      // original hash as the next compare point, while the run-start report
      // remains a separate immutable snapshot owned by the supervisor.
      stage.originals.set(destination, digest(bytes));
      stage.baseline.set(path, digest(bytes));
      result.published++;
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return result;
}
