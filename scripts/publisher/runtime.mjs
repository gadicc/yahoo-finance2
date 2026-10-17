/** Deno execution exists only behind publisher lifecycle/rehearsal boundaries. */
import assert from "node:assert/strict";
import { getTemporaryBinFolder } from "@sebbo2002/semantic-release-jsr";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { hashFile, verifyStage } from "./stage.mjs";

/** Pinned JSR spawns its binary through a shell; refuse unsafe download paths.
 * This does not constrain the checkout/stage cwd, which is passed separately.
 * @param {string} directory */
export function assertPublisherTemporaryPath(directory) {
  assert(
    process.platform === "linux" && /^\/[A-Za-z0-9_./-]+$/.test(directory),
    "Pinned publisher requires a Linux shell-safe temporary directory",
  );
}

/** Locate the exact binary downloaded and hash-checked by pinned JSR 0.14.3. */
export function publisherBinary() {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(dirname(require.resolve("jsr")));
  assert.equal(
    JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version,
    "0.14.3",
    "Re-audit publisher binary when JSR changes",
  );
  const version = "2.6.7";
  assertPublisherTemporaryPath(getTemporaryBinFolder());
  const binary = join(
    getTemporaryBinFolder(),
    `v${version}`,
    process.platform,
    process.platform === "win32" ? "deno.exe" : "deno",
  );
  assert(
    lstatSync(binary).isFile() && !lstatSync(binary).isSymbolicLink(),
    "Pinned JSR publisher binary missing",
  );
  return { binary, version, sha256: hashFile(binary) };
}

/** Generate the publisher's auxiliary lock after actual upstream dry-run.
 * This is acquisition for publishing, never a root development command.
 * @param {ReturnType<import('./stage.mjs').createJsrStage>} stage
 */
export function acquirePublisherLock(stage) {
  verifyStage(stage);
  const runtime = publisherBinary();
  const execute = (/** @type {string[]} */ args) => {
    const child = spawnSync(runtime.binary, args, {
      cwd: stage.stage,
      env: process.env,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  };
  assert.match(execute(["--version"]), /^deno 2\.6\.7 /m);
  execute([
    "cache",
    "--lock=deno.lock",
    ...new Set(Object.values(stage.metadata.exports)),
  ]);
  return { ...runtime, lockSha256: hashFile(join(stage.stage, "deno.lock")) };
}

/** Freeze config because pinned Deno publish has no CLI frozen flag.
 * @param {ReturnType<import('./stage.mjs').createJsrStage>} stage */
export function freezePublisherLock(stage) {
  stage.metadata.lock.frozen = true;
  writeFileSync(
    join(stage.stage, "deno.json"),
    `${JSON.stringify(stage.metadata, null, 2)}\n`,
  );
  verifyStage(stage);
}
