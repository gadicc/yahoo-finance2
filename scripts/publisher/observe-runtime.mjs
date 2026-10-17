/** Generate an internal runtime observation; only the explicit publisher invokes Deno. */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** @param {string} root @param {string} version @param {boolean} terminal */
export function runtimeObservationSource(root, version, terminal) {
  const module = pathToFileURL(join(root, "src/lib/runtime-detect.ts")).href;
  return `import assert from "node:assert/strict";
import process from "node:process";
import { detectRuntime, checkSupport, stdoutIsTerminal } from ${JSON.stringify(module)};
globalThis.fetch = () => Promise.reject(new Error("Publisher runtime observation ordinary fetch forbidden"));
assert.equal(Deno.version.deno, ${JSON.stringify(version)});
assert.equal(typeof process.versions.node, "string");
assert.equal(process.versions.deno, Deno.version.deno);
assert.equal(globalThis.process, process);
const info=detectRuntime();
assert.equal(info.runtime,"deno");assert.equal(info.version,Deno.version.deno);
assert.equal(info.details.nodeCompat,true);
assert.equal(checkSupport({deno:"2.0.0"}).ok,true);
assert.equal(Deno.stdout.isTerminal(),${terminal});
assert.equal(stdoutIsTerminal(),${terminal});
console.log(JSON.stringify({runtime:info.runtime,version:info.version,nodeCompat:process.versions.node,denoCompat:process.versions.deno,terminal:stdoutIsTerminal(),network:"denied"}));
`;
}
