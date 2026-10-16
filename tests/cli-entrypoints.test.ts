import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { projectIt as test } from "./migration/runner.ts";
import { expect } from "./migration/assertions.ts";
import { mainCli } from "../bin/yahoo-finance.ts";
import {
  isLocalHost,
  parseMcpArgs,
  validateHttpOptions,
} from "../bin/yahoo-finance-mcp.ts";
import {
  createCookieJar,
  ensurePrivateFile,
  getCookiePath,
  isMainModule,
  readUtf8,
} from "../bin/runtime.ts";
import { Cookie } from "tough-cookie";
import pkg from "../deno.json" with { type: "json" };

const cli = path.resolve("bin/yahoo-finance.ts");
const mcp = path.resolve("bin/yahoo-finance-mcp.ts");
const runtime = pathToFileURL(path.resolve("bin/runtime.ts")).href;
function workspace() {
  const root = fs.mkdtempSync(path.join(tmpdir(), "yf-bin-test-"));
  return {
    root,
    put(name: string, value: string) {
      const file = path.join(root, name);
      fs.writeFileSync(file, value);
      return file;
    },
    [Symbol.dispose]() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
function environment(
  home?: string,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "YAHOO_FINANCE_MCP_TOKEN",
  ])
    delete env[key];
  if (home) env.HOME = home;
  return { ...env, ...extra };
}
function execute(
  file: string,
  args: string[],
  cwd: string,
  home?: string,
  input?: string,
  extra: NodeJS.ProcessEnv = {},
) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd,
    env: environment(home, extra),
    encoding: "utf8",
    input,
    timeout: 8000,
  });
  if (result.error) throw result.error;
  return result;
}

test("source entrypoints import safely and help/version need no HOME or cookie store", () => {
  using space = workspace();
  for (const file of [cli, mcp]) {
    const help = execute(file, ["--help"], space.root);
    expect(help.status).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toContain("Usage:");
    const version = execute(file, ["--version"], space.root);
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(pkg.version);
    expect(version.stderr).toBe("");
  }
  const imported = spawnSync(
    process.execPath,
    [
      "-e",
      `await import(${JSON.stringify(pathToFileURL(cli).href)});await import(${JSON.stringify(
        pathToFileURL(mcp).href,
      )});console.log('IMPORTED');`,
    ],
    {
      cwd: space.root,
      env: environment(),
      encoding: "utf8",
      timeout: 8000,
    },
  );
  expect(imported.status).toBe(0);
  expect(imported.stdout.trim()).toBe("IMPORTED");
  expect(imported.stderr).toBe("");
  expect(fs.readdirSync(space.root)).toEqual([]);
}, 20000);

test("main guards and source invocations resolve executable symlinks outside the checkout", () => {
  using space = workspace();
  const link = path.join(space.root, "yahoo-finance");
  fs.symlinkSync(cli, link);
  expect(isMainModule(pathToFileURL(cli).href, link)).toBe(true);
  expect(isMainModule(pathToFileURL(mcp).href, link)).toBe(false);
  expect(isMainModule("not a file URL", link)).toBe(false);
  const result = execute(link, ["--version"], space.root);
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(pkg.version);
});

test("CLI source subprocess preserves usage/runtime exits and reads actual stdin", () => {
  using space = workspace();
  for (const args of [
    [],
    ["notAModule"],
    ["quote", "{"],
    ["quote", "AAPL", "--stdin"],
  ]) {
    const result = execute(cli, args, space.root);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
  }
  const invalid = execute(
    cli,
    ["quote", "--stdin"],
    space.root,
    undefined,
    "{",
  );
  expect(invalid.status).toBe(2);
  expect(invalid.stderr).toContain("Invalid JSON from stdin");
  expect(invalid.stderr).not.toContain("at JSON.parse");
  const missingHome = execute(
    cli,
    ["quote", "--stdin"],
    space.root,
    undefined,
    '{"query":"AAPL"}',
  );
  expect(missingHome.status).toBe(1);
  expect(missingHome.stdout).toBe("");
  expect(missingHome.stderr).toContain("HOME environment variable");
  expect(fs.readdirSync(space.root)).toEqual([]);
}, 20000);

test("CLI adapter emits machine JSON from stdin and keeps diagnostics on stderr", () => {
  using space = workspace();
  const driver = space.put(
    "driver.mjs",
    `import {mainCli} from ${JSON.stringify(pathToFileURL(cli).href)};
process.exitCode=await mainCli(process.argv.slice(2),{createClient:(logger)=>({quote:(...args)=>{logger.info('library diagnostic');return {args,value:123n};}})});`,
  );
  const result = execute(
    driver,
    ["quote", "--stdin"],
    space.root,
    undefined,
    '{"query":"AAPL"}',
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ args: ["AAPL"], value: "123" });
  expect(result.stderr.trim()).toBe("library diagnostic");
});

test("CLI adapter routes terminal output through depth/color inspection", async () => {
  let inspected: unknown;
  let options: unknown;
  const code = await mainCli(["quote", "AAPL"], {
    createClient: () => ({ quote: () => ({ symbol: "AAPL" }) }),
    stdoutIsTerminal: () => true,
    output: {
      stdout: () => {
        throw new Error("unexpected JSON output");
      },
      stderr: () => {},
      stdoutDir: (value, config) => {
        inspected = value;
        options = config;
      },
      stderrDir: () => {},
    },
  });
  expect(code).toBe(0);
  expect(inspected).toEqual({ symbol: "AAPL" });
  expect(options).toEqual({ depth: null, colors: true });
  const bytes = Buffer.from("split unicode: 🐉");
  expect(
    await readUtf8(
      Readable.from([
        bytes.subarray(0, bytes.length - 2),
        bytes.subarray(bytes.length - 2),
      ]),
    ),
  ).toBe("split unicode: 🐉");
});

test("cookie paths preserve HOME location and explicitly support Windows profile fallback", () => {
  expect(getCookiePath({ HOME: "/custom/home" }, "linux")).toBe(
    "/custom/home/.yf2-cookies.json",
  );
  expect(() => getCookiePath({}, "linux")).toThrow("HOME environment variable");
  expect(getCookiePath({ USERPROFILE: "C:\\Users\\test" }, "win32")).toBe(
    "C:\\Users\\test\\.yf2-cookies.json",
  );
  expect(
    getCookiePath({ HOMEDRIVE: "D:", HOMEPATH: "\\profile" }, "win32"),
  ).toBe("D:\\profile\\.yf2-cookies.json");
});

test("cookie creation is exclusive and private immediately, preserves contents and tightens existing modes", () => {
  using space = workspace();
  const file = path.join(space.root, ".yf2-cookies.json");
  const oldUmask = process.umask(0);
  let initialMode: number | undefined;
  try {
    ensurePrivateFile(file, {
      fs: {
        open: (name, flags, mode) => {
          const fd = fs.openSync(name, flags, mode);
          initialMode = fs.fstatSync(fd).mode & 0o777;
          return fd;
        },
        lstat: fs.lstatSync,
        fstat: fs.fstatSync,
        chmod: fs.fchmodSync,
        close: fs.closeSync,
      },
    });
  } finally {
    process.umask(oldUmask);
  }
  expect(initialMode).toBe(0o600);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  fs.writeFileSync(file, "preserve existing contents");
  fs.chmodSync(file, 0o644);
  ensurePrivateFile(file);
  expect(fs.readFileSync(file, "utf8")).toBe("preserve existing contents");
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

test("cookie setup rejects symlinks/directories and sanitizes failures while closing descriptors", () => {
  using space = workspace();
  const target = space.put("target", "do not change");
  const link = path.join(space.root, "link");
  fs.symlinkSync(target, link);
  expect(() => ensurePrivateFile(link)).toThrow("regular file");
  expect(fs.readFileSync(target, "utf8")).toBe("do not change");
  expect(() => ensurePrivateFile(space.root)).toThrow("regular file");
  let closes = 0;
  const operations = {
    open: fs.openSync,
    lstat: fs.lstatSync,
    fstat: fs.fstatSync,
    chmod: () => {
      throw Object.assign(new Error("private cookie marker"), {
        code: "EACCES",
      });
    },
    close: (fd: number) => {
      closes++;
      fs.closeSync(fd);
    },
  };
  expect(() =>
    ensurePrivateFile(path.join(space.root, "posix"), { fs: operations }),
  ).toThrow("owner-only access");
  expect(closes).toBe(1);
  operations.chmod = () => {
    throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
  };
  expect(() =>
    ensurePrivateFile(path.join(space.root, "windows"), {
      fs: operations,
      platform: "win32",
    }),
  ).not.toThrow();
  expect(closes).toBe(2);
});

test("cookie setup rejects real hardlinks before chmod or store parsing", () => {
  using space = workspace();
  const source = space.put("unrelated.json", "private linked contents");
  const cookie = path.join(space.root, ".yf2-cookies.json");
  fs.chmodSync(source, 0o644);
  fs.linkSync(source, cookie);
  const before = fs.statSync(source);
  expect(before.nlink).toBe(2);
  expect(() => ensurePrivateFile(cookie)).toThrow("owner-only access");
  expect(() => createCookieJar({ HOME: space.root })).toThrow(
    "Unable to prepare",
  );
  expect(fs.readFileSync(source, "utf8")).toBe("private linked contents");
  expect(fs.statSync(source).mode).toBe(before.mode);
  expect(fs.statSync(cookie).ino).toBe(before.ino);
});

test("cookie setup rejects links added around opened/current checks and still closes the descriptor", () => {
  for (const stage of [
    "after-lstat",
    "after-fstat",
    "removed-after-fstat",
    "replacement",
  ] as const) {
    using space = workspace();
    const cookie = space.put("cookie", "preserve race bytes");
    const alias = path.join(space.root, "unrelated.json");
    const replacement = space.put("replacement", "preserve replacement bytes");
    fs.chmodSync(cookie, 0o644);
    fs.chmodSync(replacement, 0o640);
    const cookieMode = fs.statSync(cookie).mode;
    const replacementMode = fs.statSync(replacement).mode;
    let stats = 0;
    let chmods = 0;
    let closes = 0;
    expect(() =>
      ensurePrivateFile(cookie, {
        fs: {
          open: fs.openSync,
          lstat: (file) => {
            const result = fs.lstatSync(file);
            if (++stats === 1 && stage === "after-lstat")
              fs.linkSync(cookie, alias);
            return result;
          },
          fstat: (fd) => {
            if (stage === "removed-after-fstat") fs.linkSync(cookie, alias);
            const result = fs.fstatSync(fd);
            if (stage === "removed-after-fstat") fs.unlinkSync(alias);
            if (stage === "after-fstat") fs.linkSync(cookie, alias);
            if (stage === "replacement") {
              fs.renameSync(cookie, alias);
              fs.linkSync(replacement, cookie);
            }
            return result;
          },
          chmod: (fd, mode) => {
            chmods++;
            fs.fchmodSync(fd, mode);
          },
          close: (fd) => {
            closes++;
            fs.closeSync(fd);
          },
        },
      }),
    ).toThrow("owner-only access");
    expect(chmods).toBe(0);
    expect(closes).toBe(1);
    const original = stage === "replacement" ? alias : cookie;
    expect(fs.readFileSync(original, "utf8")).toBe("preserve race bytes");
    expect(fs.statSync(original).mode).toBe(cookieMode);
    expect(fs.readFileSync(replacement, "utf8")).toBe(
      "preserve replacement bytes",
    );
    expect(fs.statSync(replacement).mode).toBe(replacementMode);
  }
});

test("hardlink rejection retains sanitized close-error precedence", () => {
  using space = workspace();
  const cookie = space.put("cookie", "private marker");
  let closed = false;
  expect(() =>
    ensurePrivateFile(cookie, {
      fs: {
        open: fs.openSync,
        lstat: fs.lstatSync,
        fstat: (fd) => {
          fs.linkSync(cookie, path.join(space.root, "alias"));
          return fs.fstatSync(fd);
        },
        chmod: () => {
          throw new Error("chmod must not run");
        },
        close: (fd) => {
          fs.closeSync(fd);
          closed = true;
          throw new Error("private close marker");
        },
      },
    }),
  ).toThrow("Unable to close the private cookie store.");
  expect(closed).toBe(true);
  expect(fs.readFileSync(cookie, "utf8")).toBe("private marker");
});

test("cookie setup keeps sanitized close failures ahead of preparation failures", () => {
  using space = workspace();
  for (const failPreparation of [false, true]) {
    let closes = 0;
    let failure: unknown;
    try {
      ensurePrivateFile(path.join(space.root, `close-${failPreparation}`), {
        fs: {
          open: fs.openSync,
          lstat: fs.lstatSync,
          fstat: fs.fstatSync,
          chmod: () => {
            if (failPreparation) throw new Error("private preparation marker");
          },
          close: (fd) => {
            closes++;
            fs.closeSync(fd);
            throw new Error("private close marker");
          },
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Unable to close the private cookie store.",
    );
    expect(closes).toBe(1);
  }
});

test("concurrent cookie creators preserve one private file without truncating it", async () => {
  using space = workspace();
  const file = path.join(space.root, ".yf2-cookies.json");
  const driver = space.put(
    "create.mjs",
    `import{ensurePrivateFile}from${JSON.stringify(
      runtime,
    )};ensurePrivateFile(process.argv[2]);`,
  );
  const results = await Promise.all(
    Array.from({ length: 6 }, async () => {
      const child = spawn(process.execPath, [driver, file], {
        cwd: space.root,
        env: environment(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const [code] = await once(child, "exit");
      return { code, stderr };
    }),
  );
  for (const result of results) {
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  }
  expect(fs.readFileSync(file, "utf8")).toBe("");
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  fs.writeFileSync(file, "existing race data");
  const later = execute(driver, [file], space.root);
  expect(later.status).toBe(0);
  expect(fs.readFileSync(file, "utf8")).toBe("existing race data");
}, 15000);

test("cookie load errors never echo cookie data and restore the warning logger", () => {
  using space = workspace();
  space.put(".yf2-cookies.json", "not a cookie store: private marker");
  const warn = console.warn;
  expect(() => createCookieJar({ HOME: space.root })).toThrow(
    "Unable to load the private cookie store.",
  );
  expect(console.warn).toBe(warn);
  const result = execute(cli, ["quote", "AAPL"], space.root, space.root);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain("private marker");
  expect(result.stderr).toContain("private cookie store");
});

test("cookie-constructor warnings redact cookie objects and leave JSON stdout clean", async () => {
  using space = workspace();
  space.put(
    ".yf2-cookies.json",
    JSON.stringify({
      "example.com": {
        "/": { sid: { key: "sid", value: "warning-cookie-sentinel" } },
      },
    }),
  );
  const originalFromJSON = Cookie.fromJSON;
  const originalWarn = console.warn;
  const warnings: string[] = [];
  const capture = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  const stdout: string[] = [];
  try {
    // Exercise the dependency's warning branch for an unreadable stored entry.
    Cookie.fromJSON = () => undefined;
    console.warn = capture;
    const code = await mainCli(["quote", "AAPL"], {
      createClient: () => {
        createCookieJar({ HOME: space.root });
        return { quote: () => ({ ok: true }) };
      },
      stdoutIsTerminal: () => false,
      output: {
        stdout: (value) => {
          stdout.push(String(value));
        },
        stderr: () => {},
        stdoutDir: () => {},
        stderrDir: () => {},
      },
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.join(""))).toEqual({ ok: true });
    expect(warnings).toEqual([
      "Warning: Unable to parse a cookie store entry.",
    ]);
    expect(warnings.join("")).not.toContain("warning-cookie-sentinel");
    expect(console.warn).toBe(capture);
  } finally {
    Cookie.fromJSON = originalFromJSON;
    console.warn = originalWarn;
  }
});

test("MCP argument/security boundaries precede cookies and preserve environment-token precedence", () => {
  const envToken = "test-only-token";
  const parsed = parseMcpArgs(["--http", "--host", "0.0.0.0"], {
    YAHOO_FINANCE_MCP_TOKEN: envToken,
  });
  expect(typeof parsed).toBe("object");
  if (typeof parsed === "string") throw new Error("unexpected help");
  expect(parsed.token).toBe(envToken);
  expect(() => validateHttpOptions(parsed)).not.toThrow();
  expect(
    parseMcpArgs(["--token", "explicit"], {
      YAHOO_FINANCE_MCP_TOKEN: envToken,
    }),
  ).toMatchObject({ token: "explicit" });
  for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
    expect(isLocalHost(host)).toBe(true);
  }
  expect(isLocalHost("127.0.0.1.attacker.invalid")).toBe(false);
  using space = workspace();
  const rejected = execute(mcp, ["--http", "--host", "0.0.0.0"], space.root);
  expect(rejected.status).toBe(2);
  expect(rejected.stderr).toContain("Refusing to bind");
  expect(fs.readdirSync(space.root)).toEqual([]);
  for (const args of [
    ["--transport", "bad"],
    ["--port", "65536"],
    ["--port", "bad"],
    ["--path", "mcp"],
    ["--token"],
    ["--unknown"],
  ])
    expect(execute(mcp, args, space.root).status).toBe(2);
  const assignment = execute(mcp, ["--token=test-only-token"], space.root);
  expect(assignment.status).toBe(2);
  expect(assignment.stderr).not.toContain(envToken);
  const toolError = execute(
    mcp,
    ["--token", envToken, "--tools", envToken],
    space.root,
    space.root,
  );
  expect(toolError.status).toBe(1);
  expect(toolError.stderr).not.toContain(envToken);
  expect(toolError.stderr).toContain("[redacted]");
  for (const [args, env] of [
    [
      ["--http", "--host", "0.0.0.0"],
      {
        YAHOO_FINANCE_MCP_TOKEN: envToken,
      },
    ],
    [["--http", "--host", "0.0.0.0", "--unsafe-no-token"], {}],
  ] as [string[], NodeJS.ProcessEnv][]) {
    const allowed = execute(mcp, args, space.root, undefined, undefined, env);
    expect(allowed.status).toBe(1);
    expect(allowed.stderr).toContain("HOME environment variable");
    expect(allowed.stderr).not.toContain(envToken);
  }
}, 20000);

test("MCP HTTP startup failures are caught under the offline guard without leaking tokens", () => {
  using space = workspace();
  const result = execute(
    mcp,
    ["--http", "--port", "0"],
    space.root,
    space.root,
    undefined,
    { YAHOO_FINANCE_MCP_TOKEN: "test-http-token" },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Unable to start the MCP HTTP server.");
  expect(result.stderr).not.toContain("test-http-token");
  expect(
    fs.statSync(path.join(space.root, ".yf2-cookies.json")).mode & 0o777,
  ).toBe(0o600);
});

test("real MCP stdio child initializes, lists filtered tools and shuts down on EOF or signal", async () => {
  for (const shutdown of ["eof", "SIGTERM", "SIGINT"] as const) {
    using space = workspace();
    const cookie = space.put(".yf2-cookies.json", "{}");
    fs.chmodSync(cookie, 0o644);
    const child = spawn(
      process.execPath,
      [mcp, "--stdio", "--tools", "quote,search"],
      {
        cwd: space.root,
        env: environment(space.root),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const exited = once(child, "exit");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const response = async (id: number) => {
      const deadline = Date.now() + 8000;
      while (true) {
        for (const line of stdout.split("\n").filter(Boolean)) {
          const message = JSON.parse(line);
          if (message.id === id) return message;
        }
        if (child.exitCode !== null || Date.now() > deadline) {
          throw new Error(`MCP child did not respond: ${stderr}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    const send = (message: unknown) =>
      child.stdin.write(JSON.stringify(message) + "\n");
    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "offline-entrypoint-test", version: "1" },
        },
      });
      expect((await response(1)).result.serverInfo.name).toBe("yahoo-finance2");
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      expect(
        (await response(2)).result.tools.map(
          (tool: { name: string }) => tool.name,
        ),
      ).toEqual(["quote", "search"]);
      if (shutdown === "eof") child.stdin.end();
      else child.kill(shutdown);
      const [code, signal] = await exited;
      expect(code).toBe(0);
      expect(signal).toBe(null);
      expect(stderr).toBe("");
      expect(fs.readFileSync(cookie, "utf8")).toBe("{}");
      expect(fs.statSync(cookie).mode & 0o777).toBe(0o600);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await exited;
    }
  }
}, 25000);
