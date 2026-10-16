// Copy beside real installed node_modules; use the strict guard or explicit native job.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const packageName = "yahoo-finance2";
const { default: YahooFinance } = await import(packageName);

const require = createRequire(fileURLToPath(import.meta.url));
const packageRoot = resolve(
  dirname(require.resolve("yahoo-finance2")),
  "../..",
);
const detector = `./${relative(
  dirname(fileURLToPath(import.meta.url)),
  resolve(packageRoot, "esm/src/lib/runtime-detect.js"),
)
  .split(sep)
  .join("/")}`;
const { detectRuntime, checkSupport, stdoutIsTerminal } = await import(
  detector
);
const expectedRuntime = process.versions.bun ? "bun" : "node";
const expectedVersion = process.versions.bun ?? process.versions.node;
const terminal = process.argv[2] === "tty";
assert.deepEqual(
  { runtime: detectRuntime().runtime, version: detectRuntime().version },
  { runtime: expectedRuntime, version: expectedVersion },
);
const { MIN_SUPPORTED_RUNTIMES } = await import(detector);
assert.deepEqual(MIN_SUPPORTED_RUNTIMES, {
  node: "22.0.0",
  deno: "2.0.0",
  bun: "1.4.3",
  cloudflare: { requireFeatures: [] },
});
assert.equal(checkSupport(MIN_SUPPORTED_RUNTIMES).ok, true);
const metadata = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
);
assert.deepEqual(metadata.engines, {
  node: `>=${MIN_SUPPORTED_RUNTIMES.node}`,
  bun: `>=${MIN_SUPPORTED_RUNTIMES.bun}`,
});
// Node's configurable globals model Bun boundaries against the real installed
// constructor; actual Bun's immutable global is verified in its separate row.
if (expectedRuntime === "node") {
  const host = globalThis.process;
  /** @type {Array<[string, PropertyDescriptor | undefined]>} */
  const saved = ["Bun", "process"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  try {
    for (const version of [
      "1.4.3",
      "1.4.4",
      "1.4.3+build.1",
      "1.4.2",
      "1.0.0",
      "1.4.3-rc.1",
      "1.4",
      "malformed",
    ]) {
      const simulated = Object.create(host);
      Object.defineProperty(simulated, "versions", {
        value: { ...host.versions, bun: version },
      });
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        value: simulated,
      });
      Object.defineProperty(globalThis, "Bun", {
        configurable: true,
        value: { version },
      });
      /** @type {string[]} */
      const warnings = [];
      const logger = {
        info() {},
        dir() {},
        debug() {},
        error() {},
        /** @param {unknown} message */ warn(message) {
          warnings.push(String(message));
        },
      };
      const supported = ["1.4.3", "1.4.4", "1.4.3+build.1"].includes(version);
      assert.equal(checkSupport(MIN_SUPPORTED_RUNTIMES).ok, supported);
      assert.doesNotThrow(
        () =>
          new YahooFinance({
            versionCheck: false,
            logger,
            suppressNotices: ["yahooSurvey"],
          }),
      );
      assert.equal(warnings.length, supported ? 0 : 1);
      if (!supported) assert.match(warnings[0], /Requires Bun >= 1\.4\.3/);
    }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

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
