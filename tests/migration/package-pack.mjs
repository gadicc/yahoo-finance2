// Run inside scripts/testing/offline.py; all arguments must point into scratch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [directory, destination, node, npm] = process.argv.slice(2);
assert(directory && destination && node && npm, "Usage: package-pack.mjs PACKAGE DIRECTORY NODE NPM_CLI_JS");
mkdirSync(destination, { recursive: true });
const result = spawnSync(node, [npm, "pack", directory, "--pack-destination", destination, "--ignore-scripts", "--offline", "--json", "--cache", join(destination, "npm-cache")], { encoding: "utf8" });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
/** @typedef {{path: string, mode: number}} PackedFile */
/** @type {{filename: string, files: PackedFile[], entryCount: number, bundled: string[], unpackedSize: number}} */
const packed = JSON.parse(result.stdout)[0];
const files = packed.files.map((file) => file.path);
assert.equal(packed.entryCount, files.length);
assert.equal(packed.bundled.length, 0);
for (const file of packed.files) {
  assert.match(file.path, /^(?:(?:esm|script|skills)\/|LICENSE$|README\.md$|package\.json$)/);
  assert(!/(?:^|\/)(?:node_modules|fixtures|tests|coverage|\.git|\.migration-results)(?:\/|$)/.test(file.path), file.path);
  assert(!/\.test\.|\.env|\.tsbuildinfo|\.map$/.test(file.path), file.path);
  assert(!file.path.endsWith(".ts") || file.path.endsWith(".d.ts"), file.path);
}
assert(!files.includes(".yahoo-finance2-build.json"));
for (const format of ["esm", "script"]) {
  assert.equal(files.filter((file) => file.startsWith(format + "/") && file.endsWith(".schema.json")).length, 13);
  assert(files.includes(format + "/deno.json"));
  assert(files.includes(format + "/package.json"));
}
for (const asset of ["LICENSE", "README.md", "skills/yahoo-finance2/SKILL.md", "esm/bin/runtime.js"]) assert(files.includes(asset), asset);
for (const bin of ["esm/bin/yahoo-finance.js", "esm/bin/yahoo-finance-mcp.js"]) assert.equal((/** @type {PackedFile} */ (packed.files.find((file) => file.path === bin))).mode, 0o755);
assert(!files.some((file) => file.startsWith("script/bin/")));
const sha256 = createHash("sha256").update(readFileSync(join(destination, packed.filename))).digest("hex");
writeFileSync(join(destination, "pack.json"), JSON.stringify({ ...packed, sha256 }, null, 2) + "\n");
console.log(JSON.stringify({ filename: packed.filename, entryCount: packed.entryCount, unpackedSize: packed.unpackedSize, sha256, schemas: 26, bundled: packed.bundled }));
