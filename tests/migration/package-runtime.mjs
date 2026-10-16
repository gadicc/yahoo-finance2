// Copy beside a real installed node_modules; run under the strict offline guard.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const packageName = "yahoo-finance2";
const { default: YahooFinance } = await import(packageName);

const require = createRequire(import.meta.url);
const packageRoot = resolve(
  dirname(require.resolve("yahoo-finance2")),
  "../..",
);
const { detectRuntime, checkSupport, stdoutIsTerminal } = await import(
  pathToFileURL(resolve(packageRoot, "esm/src/lib/runtime-detect.js")).href
);
const expectedRuntime = process.versions.bun ? "bun" : "node";
const expectedVersion = process.versions.bun ?? process.versions.node;
const terminal = process.argv[2] === "tty";
assert.deepEqual(
  { runtime: detectRuntime().runtime, version: detectRuntime().version },
  { runtime: expectedRuntime, version: expectedVersion },
);
assert.equal(checkSupport({ node: "22.0.0", bun: "1.0.0" }).ok, true);
assert.equal(stdoutIsTerminal(), terminal);
/** @type {Array<[string, PropertyDescriptor | undefined]>} */
const descriptors = ["self", "Deno"].map((key) => [
  key,
  Object.getOwnPropertyDescriptor(globalThis, key),
]);
try {
  const selfDescriptor = Object.getOwnPropertyDescriptor(globalThis, "self");
  Object.defineProperty(
    globalThis,
    "self",
    selfDescriptor?.configurable === false
      ? { value: {} }
      : { configurable: true, value: {} },
  );
  Object.defineProperty(globalThis, "Deno", {
    configurable: true,
    value: {
      version: { deno: "2.0.0" },
      stdout: {
        isTerminal() {
          throw new Error("Incidental shim called");
        },
      },
    },
  });
  assert.equal(detectRuntime().runtime, expectedRuntime);
  assert.equal(stdoutIsTerminal(), terminal);
  /** @type {string[]} */
  const calls = [];
  const logger = {
    info() {
      calls.push("info");
    },
    dir() {
      calls.push("dir");
    },
    /** @param {unknown} message */
    warn(message) {
      calls.push(String(message));
    },
    error() {},
    debug() {},
  };
  const exercise = () => {
    calls.length = 0;
    const client = new YahooFinance({
      versionCheck: false,
      logger,
      suppressNotices: ["yahooSurvey"],
    });
    client._logObj({ controlled: true });
    assert.deepEqual(calls, [terminal ? "dir" : "info"]);
  };
  exercise();
  const denied = () => {
    throw new Error("Unavailable compatibility property");
  };
  for (const value of [
    {
      get version() {
        return denied();
      },
    },
    new Proxy({}, { get: denied }),
  ]) {
    Object.defineProperty(globalThis, "Deno", { configurable: true, value });
    assert.equal(detectRuntime().runtime, expectedRuntime);
    assert.equal(stdoutIsTerminal(), terminal);
    exercise();
  }
  Object.defineProperty(globalThis, "Deno", {
    configurable: true,
    get: denied,
  });
  assert.equal(detectRuntime().runtime, expectedRuntime);
  assert.equal(stdoutIsTerminal(), terminal);
  exercise();
} finally {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
console.log(
  JSON.stringify({
    runtime: expectedRuntime,
    version: expectedVersion,
    terminal,
    platform: process.platform,
    compatibilityGlobals: "passed, including throwing accessors and proxies",
    constructorWarnings: 0,
  }),
);
