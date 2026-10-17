import { describe, it } from "../../tests/helpers/runner.ts";
import { expect } from "../../tests/helpers/assertions.ts";
import createYahooFinance from "../createYahooFinance.ts";
import { readFileSync } from "node:fs";
import { createContext, runInContext, type Context } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import * as nativeRuntime from "./runtime-detect.ts";
import * as nativeGlobal from "./runtimeGlobal.ts";

function compile(name: string): string {
  return ts.transpileModule(
    readFileSync(new URL(name, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}
const runtimeSource = compile("./runtime-detect.ts");
const globalSource = compile("./runtimeGlobal.ts");
let runtime = nativeRuntime;
let globals = nativeGlobal;
let expectedGlobal: unknown = globalThis;
const detectRuntime = () => runtime.detectRuntime();
const checkSupport = (policy?: nativeRuntime.SupportPolicy) =>
  runtime.checkSupport(policy);
const assertSupported = (policy: nativeRuntime.SupportPolicy) =>
  runtime.assertSupported(policy);
const stdoutIsTerminal = () => runtime.stdoutIsTerminal();
const getRuntimeGlobal = () => globals.getRuntimeGlobal();
const getGlobalValue = (name: string) => globals.getGlobalValue(name);
const { isVersionAtLeast } = nativeRuntime;

/** Separate contexts model host globals without changing Bun's immutable Bun global. */
function withGlobals(
  values: Record<string, unknown>,
  body: (context: Context) => void,
): void {
  const previous = { runtime, globals, expectedGlobal };
  const context = createContext({ exports: {} });
  Object.defineProperties(context, Object.getOwnPropertyDescriptors(values));
  runInContext(globalSource, context);
  globals = context.exports as typeof nativeGlobal;
  context.require = (name: string) => {
    if (name !== "./runtimeGlobal.ts")
      throw new Error(`Unexpected import: ${name}`);
    return globals;
  };
  context.exports = {};
  runInContext(runtimeSource, context);
  runtime = context.exports as typeof nativeRuntime;
  expectedGlobal = runInContext("globalThis", context);
  try {
    body(context);
  } finally {
    ({ runtime, globals, expectedGlobal } = previous);
  }
}
/** Constructor integration changes only configurable globals and restores descriptors. */
function withHostGlobals(
  values: Record<string, unknown>,
  body: () => void,
): void {
  const descriptors = Object.keys(values).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  try {
    for (const key of Object.keys(values))
      Object.defineProperty(globalThis, key, {
        ...Object.getOwnPropertyDescriptor(values, key),
        configurable: true,
      });
    body();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
const node = { versions: { node: "22.0.0" }, stdout: { isTTY: false } };
const deno = {
  version: { deno: "2.0.0" },
  build: { os: "linux", arch: "x86_64" },
};
const worker = {
  navigator: { userAgent: "Cloudflare-Workers" },
  WebSocketPair() {},
  caches: {},
};

describe("runtime host selection", () => {
  it("uses globalThis when self or global is an incidental object", () => {
    withGlobals(
      {
        process: node,
        self: { process: { versions: { node: "1.0.0" } } },
        global: {},
      },
      () => {
        expect(getRuntimeGlobal()).toBe(expectedGlobal);
        expect(getGlobalValue("process")).toBe(node);
        expect(detectRuntime()).toMatchObject({
          runtime: "node",
          version: "22.0.0",
        });
      },
    );
  });
  it("keeps Node in the presence of incidental Deno, Bun, UA and worker globals", () => {
    for (const compatibility of [
      { Deno: deno },
      { Bun: { version: "1.0.0" } },
      { navigator: worker.navigator },
      { WebSocketPair: worker.WebSocketPair, caches: worker.caches },
    ])
      withGlobals({ process: node, ...compatibility }, () => {
        expect(detectRuntime().runtime).toBe("node");
      });
  });
  it("recognizes Bun's Node compatibility version before Node and incidental Deno", () => {
    withGlobals(
      {
        Bun: { version: "1.0.0", revision: "revision" },
        process: { versions: { node: "18.15.0", bun: "1.0.0" } },
        Deno: deno,
      },
      () => {
        expect(detectRuntime()).toMatchObject({
          runtime: "bun",
          version: "1.0.0",
          details: { nodeCompat: true },
        });
      },
    );
  });
  it("models Deno with and without its Node compatibility process", () => {
    for (const process of [
      undefined,
      { versions: { node: "20.11.1", deno: "2.0.0" } },
    ]) {
      withGlobals({ Deno: deno, process }, () => {
        expect(detectRuntime()).toMatchObject({
          runtime: "deno",
          version: "2.0.0",
        });
      });
    }
  });
  it("does not mistake mismatched runtime compatibility versions for the host", () => {
    withGlobals(
      {
        process: { versions: { node: "22.0.0", bun: "1.1.0", deno: "2.1.0" } },
        Bun: { version: "1.0.0" },
        Deno: deno,
      },
      () => {
        expect(detectRuntime().runtime).toBe("node");
      },
    );
  });
  it("recognizes actual workerd's Node-compatible signature and no-UA form", () => {
    for (const navigator of [worker.navigator, undefined])
      withGlobals(
        {
          ...worker,
          navigator,
          process: {
            versions: { node: "22.19.0" },
            argv0: "workerd",
            title: "workerd",
          },
        },
        () => {
          expect(detectRuntime()).toMatchObject({
            runtime: "cloudflare",
            version: null,
          });
        },
      );
  });
  it("recognizes a Worker without process and requires the actual feature pair", () => {
    withGlobals(worker, () =>
      expect(detectRuntime().runtime).toBe("cloudflare"),
    );
    withGlobals({ ...worker, navigator: undefined }, () =>
      expect(detectRuntime().runtime).toBe("cloudflare"),
    );
    for (const missing of [{ WebSocketPair: {} }, { caches: null }])
      withGlobals({ ...worker, ...missing }, () => {
        expect(detectRuntime().runtime).toBe("unknown");
      });
  });
  it("handles absent and primitive compatibility globals as unknown", () => {
    for (const value of [undefined, null, false, "shim", 1])
      withGlobals(
        { process: value, Bun: value, Deno: value, navigator: value },
        () => {
          expect(detectRuntime()).toEqual({
            runtime: "unknown",
            version: null,
            details: {},
          });
        },
      );
  });
});

describe("unavailable compatibility properties", () => {
  const denied = () => {
    throw new Error("Unavailable compatibility API");
  };
  const proxy = () => new Proxy({}, { get: denied });

  it("does not inspect incidental Bun/Deno version getters on Node", () => {
    let reads = 0;
    const candidate = {
      get version() {
        reads++;
        return denied();
      },
    };
    withGlobals({ process: node, Bun: candidate, Deno: candidate }, () => {
      expect(detectRuntime().runtime).toBe("node");
      expect(stdoutIsTerminal()).toBe(false);
      expect(reads).toBe(0);
    });
  });
  it("treats throwing global accessors and proxy traps as unavailable", () => {
    withGlobals(
      {
        process: node,
        get Bun() {
          return denied();
        },
        get Deno() {
          return denied();
        },
        get navigator() {
          return denied();
        },
        get WebSocketPair() {
          return denied();
        },
        get caches() {
          return denied();
        },
      },
      () => {
        expect(detectRuntime().runtime).toBe("node");
        expect(checkSupport({ node: "22.0.0" }).ok).toBe(true);
      },
    );
    withGlobals(
      {
        process: {
          versions: {
            node: "22.0.0",
            bun: "1.0.0",
            deno: "2.0.0",
            get v8() {
              return denied();
            },
          },
          get arch() {
            return denied();
          },
          get platform() {
            return denied();
          },
        },
        Bun: proxy(),
        Deno: proxy(),
        navigator: proxy(),
      },
      () => {
        expect(detectRuntime().runtime).toBe("node");
        expect(stdoutIsTerminal()).toBe(false);
      },
    );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const value of [proxy(), revoked.proxy])
      withGlobals(
        { process: value, Bun: value, Deno: value, navigator: value },
        () => {
          expect(detectRuntime().runtime).toBe("unknown");
          expect(stdoutIsTerminal()).toBe(false);
        },
      );
  });
  it("keeps positive runtime selection when optional metadata is unavailable", () => {
    withGlobals(
      {
        Bun: {
          version: "1.0.0",
          get revision() {
            return denied();
          },
        },
        process: { versions: { node: "18.15.0", bun: "1.0.0" } },
        Deno: proxy(),
      },
      () => expect(detectRuntime().runtime).toBe("bun"),
    );
    withGlobals(
      {
        Deno: {
          version: {
            deno: "2.0.0",
            get v8() {
              return denied();
            },
          },
          get build() {
            return denied();
          },
        },
      },
      () => expect(detectRuntime().runtime).toBe("deno"),
    );
    withGlobals(
      {
        ...worker,
        get Deno() {
          return denied();
        },
        get Bun() {
          return denied();
        },
        process: {
          versions: { node: "22.19.0" },
          get stdout() {
            return denied();
          },
        },
      },
      () => {
        expect(detectRuntime().runtime).toBe("cloudflare");
        expect(stdoutIsTerminal()).toBe(false);
        expect(
          checkSupport({ cloudflare: { requireFeatures: ["Deno.version"] } })
            .ok,
        ).toBe(false);
      },
    );
  });
  it("uses nonterminal output when terminal property getters or calls throw", () => {
    for (const process of [
      {
        versions: { node: "22.0.0" },
        get stdout() {
          return denied();
        },
      },
      {
        versions: { node: "22.0.0" },
        stdout: {
          get isTTY() {
            return denied();
          },
        },
      },
      { versions: { node: "22.0.0" }, stdout: proxy() },
    ])
      withGlobals({ process }, () => expect(stdoutIsTerminal()).toBe(false));
    for (const candidate of [
      {
        ...deno,
        get stdout() {
          return denied();
        },
      },
      {
        ...deno,
        stdout: {
          get isTerminal() {
            return denied();
          },
        },
      },
      { ...deno, stdout: proxy() },
      {
        ...deno,
        stdout: { isTerminal: new Proxy(() => true, { apply: denied }) },
      },
    ])
      withGlobals({ Deno: candidate }, () =>
        expect(stdoutIsTerminal()).toBe(false),
      );
  });
  it("constructs with versionCheck:false despite incidental getters and unavailable terminal properties", () => {
    for (const Deno of [
      {
        get version() {
          return denied();
        },
      },
      proxy(),
    ]) {
      const calls: string[] = [];
      const logger = {
        info() {
          calls.push("info");
        },
        dir() {
          calls.push("dir");
        },
        warn() {
          calls.push("warn");
        },
        debug() {},
        error() {},
      };
      withHostGlobals(
        {
          process: {
            versions: { node: "22.0.0" },
            stdout: {
              get isTTY() {
                return denied();
              },
            },
          },
          Deno,
        },
        () => {
          const Client = createYahooFinance({ modules: {} });
          const client = new Client({ versionCheck: false, logger });
          client._logObj({ value: true });
          expect(calls).toEqual(["info"]);
        },
      );
    }
    withHostGlobals(
      {
        process: node,
        get Deno() {
          return denied();
        },
      },
      () => {
        const Client = createYahooFinance({ modules: {} });
        expect(() => new Client({ versionCheck: false })).not.toThrow();
      },
    );
  });
});

describe("runtime consumer minimum", () => {
  it("keeps the canonical Node/Deno policy and Bun 1.4.3 minimum", () => {
    expect(nativeRuntime.MIN_SUPPORTED_RUNTIMES).toEqual({
      node: "22.0.0",
      deno: "2.0.0",
      bun: "1.4.3",
      cloudflare: { requireFeatures: [] },
    });
  });
  it("constructs and warns only for unsupported Bun versions", () => {
    const sourceRequire = createRequire(
      new URL("../createYahooFinance.ts", import.meta.url),
    );
    const constructorSource = compile("../createYahooFinance.ts");
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
      withGlobals({ Bun: { version } }, (context) => {
        const supported = ["1.4.3", "1.4.4", "1.4.3+build.1"].includes(version);
        expect(checkSupport(runtime.MIN_SUPPORTED_RUNTIMES).ok).toBe(supported);
        context.require = (name: string) =>
          name === "./lib/runtime-detect.ts" ? runtime : sourceRequire(name);
        context.exports = {};
        runInContext(constructorSource, context);
        const Client = context.exports.default({ modules: {} });
        const warnings: string[] = [];
        const logger = {
          info() {},
          dir() {},
          debug() {},
          error() {},
          warn(message: string) {
            warnings.push(message);
          },
        };
        expect(() => new Client({ versionCheck: false, logger })).not.toThrow();
        expect(warnings.length).toBe(supported ? 0 : 1);
        if (!supported) expect(warnings[0]).toContain("Requires Bun >= 1.4.3");
      });
    }
  });
});

describe("runtime version policy", () => {
  it("checks each retained exact minimum and immediately lower versions", () => {
    for (const [runtime, minimum, below] of [
      ["node", "22.0.0", "21.99.99"],
      ["deno", "2.0.0", "1.99.99"],
      ["bun", "1.4.3", "1.4.2"],
    ] as const) {
      for (const version of [minimum, below, `${minimum}-rc.1`]) {
        const values =
          runtime === "node"
            ? { process: { versions: { node: version } } }
            : runtime === "deno"
              ? { Deno: { version: { deno: version } } }
              : { Bun: { version } };
        withGlobals(values, () => {
          expect(checkSupport({ [runtime]: minimum }).ok).toBe(
            version === minimum,
          );
          if (version !== minimum)
            expect(() => assertSupported({ [runtime]: minimum })).toThrow(
              "Unsupported environment",
            );
        });
      }
    }
  });
  it("fails closed on malformed, missing, unsafe or partial semver input", () => {
    for (const version of [
      undefined,
      null,
      "",
      "22",
      "22.0",
      "22.0.0garbage",
      "22.0.0.1",
      " 22.0.0",
      "022.0.0",
      "22.0.0-01",
      "22.0.0+",
      ...["\n", "\r", "\r\n", "\u2028", "\u2029"].map(
        (ending) => `22.0.0${ending}`,
      ),
      "9007199254740992.0.0",
    ]) {
      expect(isVersionAtLeast(version, "22.0.0")).toBe(false);
      if (typeof version === "string")
        expect(isVersionAtLeast("22.0.0", version)).toBe(false);
    }
    expect(isVersionAtLeast("v22.0.0+build.1", "22.0.0")).toBe(true);
    withGlobals({ process: { versions: { node: "22.0.0garbage" } } }, () =>
      expect(checkSupport({ node: "22.0.0" }).ok).toBe(false),
    );
  });
  it("compares numeric and dotted prerelease identifiers by SemVer precedence", () => {
    const ascending = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let i = 0; i < ascending.length; i++)
      for (let j = 0; j < ascending.length; j++) {
        expect(isVersionAtLeast(ascending[i], ascending[j])).toBe(i >= j);
      }
    expect(
      isVersionAtLeast(
        "1.0.0-100000000000000000001",
        "1.0.0-100000000000000000000",
      ),
    ).toBe(true);
    expect(isVersionAtLeast("1.0.0-alpha-beta.2", "1.0.0-alpha-beta.1")).toBe(
      true,
    );
  });
  it("checks Worker feature paths safely through primitive and absent values", () => {
    withGlobals(worker, () => {
      expect(
        checkSupport({
          cloudflare: { requireFeatures: ["caches", "WebSocketPair"] },
        }).ok,
      ).toBe(true);
      for (const path of [
        "caches.missing",
        "navigator.userAgent.nope",
        "process.stdout",
        "",
      ]) {
        expect(
          checkSupport({ cloudflare: { requireFeatures: [path] } }).ok,
        ).toBe(false);
      }
    });
    withGlobals({}, () => expect(checkSupport().ok).toBe(false));
  });
});

describe("runtime terminal routing", () => {
  it("uses Node/Bun stdout and ignores an incidental throwing Deno terminal shim", () => {
    for (const runtime of ["node", "bun"])
      for (const isTTY of [true, false, undefined]) {
        withGlobals(
          {
            process: {
              versions: {
                node: "22.0.0",
                ...(runtime === "bun" ? { bun: "1.0.0" } : {}),
              },
              stdout: { isTTY },
            },
            Bun: runtime === "bun" ? { version: "1.0.0" } : undefined,
            Deno: {
              ...deno,
              stdout: {
                isTerminal() {
                  throw new Error("incidental shim called");
                },
              },
            },
          },
          () => {
            expect(stdoutIsTerminal()).toBe(isTTY === true);
          },
        );
      }
  });
  it("uses only Deno's terminal method with its receiver and tolerates missing APIs", () => {
    const stdout = {
      value: true,
      isTerminal() {
        return this.value;
      },
    };
    withGlobals(
      {
        Deno: { ...deno, stdout },
        process: {
          versions: { node: "20.11.1", deno: "2.0.0" },
          stdout: { isTTY: false },
        },
      },
      () => expect(stdoutIsTerminal()).toBe(true),
    );
    for (const stdout of [
      undefined,
      {},
      {
        isTerminal() {
          return false;
        },
      },
      {
        isTerminal() {
          throw new Error("closed");
        },
      },
    ]) {
      withGlobals({ Deno: { ...deno, stdout } }, () =>
        expect(stdoutIsTerminal()).toBe(false),
      );
    }
  });
  it("does not call any Node/Bun/Deno terminal API on Workers or unknown hosts", () => {
    withGlobals(
      {
        ...worker,
        process: {
          versions: { node: "22.19.0" },
          stdout: {
            get isTTY() {
              throw new Error("Node terminal accessed");
            },
          },
        },
      },
      () => expect(stdoutIsTerminal()).toBe(false),
    );
    withGlobals({}, () => expect(stdoutIsTerminal()).toBe(false));
    withGlobals({ process: { versions: { node: "22.0.0" } } }, () =>
      expect(stdoutIsTerminal()).toBe(false),
    );
  });
  it("preserves constructor warnings and routes structured versus piped logging", () => {
    for (const isTTY of [true, false]) {
      const calls: string[] = [];
      const logger = {
        info() {
          calls.push("info");
        },
        debug() {},
        warn(message: unknown) {
          calls.push(String(message));
        },
        error() {},
        dir() {
          calls.push("dir");
        },
      };
      withHostGlobals(
        {
          process: { versions: { node: "21.0.0" }, stdout: { isTTY } },
          Deno: {
            stdout: {
              isTerminal() {
                throw new Error("shim");
              },
            },
          },
        },
        () => {
          const Client = createYahooFinance({ modules: {} });
          const client = new Client({ logger, versionCheck: false });
          client._logObj({ example: true });
          expect(
            calls.some((message) =>
              message.includes("Requires Node >= 22.0.0"),
            ),
          ).toBe(true);
          expect(calls.at(-1)).toBe(isTTY ? "dir" : "info");
        },
      );
    }
  });
});
