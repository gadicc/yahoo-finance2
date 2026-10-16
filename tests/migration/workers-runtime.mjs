// Run under workers-loopback.py with a real independent Workers installation.
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const harness = realpathSync(process.argv[2]);
const require = createRequire(pathToFileURL(join(harness, "package.json")));
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(require.resolve("miniflare")).href
);
const installed = realpathSync(join(harness, "node_modules/yahoo-finance2"));
assert.equal(installed, join(harness, "node_modules/yahoo-finance2"));
const helper = join(installed, "esm/src/lib");
const root = dirname(harness);
const script = `
import { detectRuntime, checkSupport, stdoutIsTerminal } from "./runtime-detect.js";
function inspect() {
  return { info: detectRuntime(), support: checkSupport({ node:"22.0.0", deno:"2.0.0", bun:"1.0.0", cloudflare:{} }).ok, terminal:stdoutIsTerminal() };
}
export default { fetch() {
  const baseline = inspect();
  const deno = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis,"Deno",{configurable:true,value:{get version(){throw new Error("Incidental Deno version getter called")},get stdout(){throw new Error("Incidental Deno terminal getter called")}}});
    const shim = inspect();
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:undefined});
    const noUserAgent = inspect();
    return Response.json({baseline,shim,noUserAgent,nodeCompatVersion:process.versions.node,argv0:process.argv0});
  } finally {
    if(deno) Object.defineProperty(globalThis,"Deno",deno); else delete globalThis.Deno;
    if(navigator) Object.defineProperty(globalThis,"navigator",navigator); else delete globalThis.navigator;
  }
}};
`;
const mf = new Miniflare(
  convertV4MiniflareOptions({
    compatibilityDate: "2026-06-12",
    compatibilityFlags: ["nodejs_compat"],
    modules: [
      { type: "ESModule", path: join(root, "worker.js"), contents: script },
      ...["runtime-detect.js", "runtimeGlobal.js"].map((name) => ({
        type: "ESModule",
        path: join(root, name),
        contents: readFileSync(join(helper, name), "utf8"),
      })),
    ],
  }),
);
try {
  const response = await mf.dispatchFetch("http://localhost/");
  assert.equal(response.status, 200);
  const result = await response.json();
  for (const name of ["baseline", "shim", "noUserAgent"]) {
    assert.equal(result[name].info.runtime, "cloudflare", name);
    assert.equal(result[name].info.version, null, name);
    assert.equal(result[name].support, true, name);
    assert.equal(result[name].terminal, false, name);
  }
  assert.equal(result.argv0, "workerd");
  assert.equal(result.baseline.info.details.userAgent, "Cloudflare-Workers");
  assert.equal(result.noUserAgent.info.details.heuristic, true);
  console.log(JSON.stringify(result));
} finally {
  await mf.dispose();
}
