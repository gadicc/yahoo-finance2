// Run beside a real installed package with the native-platform fetch preload.
import assert from "node:assert/strict";
import { McpFrames } from "./native-mcp-frames.mjs";
import { spawn, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = realpathSync(dirname(fileURLToPath(import.meta.url)));
const [runtime, npmRuntime, npm, bun, preload, runtimeKind, protocolScope] =
  process.argv.slice(2);
assert(
  runtime && npmRuntime && npm && bun && preload,
  "Missing explicit probe runtimes",
);
const installed = join(root, "node_modules", "yahoo-finance2");
assert(!lstatSync(installed).isSymbolicLink());
const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
const outside = join(root, "outside cwd with spaces");
mkdirSync(outside, { recursive: true });
/** @type {NodeJS.ProcessEnv} */
const env = {
  ...process.env,
  PATH: dirname(runtime) + delimiter + process.env.PATH,
};
for (const name of Object.keys(env)) {
  if (
    /^(?:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|NODE_OPTIONS|BUN_OPTIONS|PATH)$/i.test(
      name,
    )
  )
    delete env[name];
}
env.PATH =
  dirname(runtime) +
  delimiter +
  (Object.entries(process.env).find(
    ([key]) => key.toUpperCase() === "PATH",
  )?.[1] ?? "");
assert(
  runtimeKind === "bun" || runtimeKind === "node",
  "Explicit runtime kind required",
);
const prefix =
  runtimeKind === "bun"
    ? ["--preload", preload]
    : ["--import", pathToFileURL(preload).href];
/** @param {string} executable @param {string[]} args @param {string} cwd */
function run(executable, args, cwd = outside) {
  const child = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 20000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, JSON.stringify({ executable, args, ...child }));
  return child;
}
let checks = 0;
for (const [name, target] of Object.entries(pkg.bin)) {
  const file = join(installed, String(target));
  assert(lstatSync(file).isFile());
  assert(readFileSync(file, "utf8").startsWith("#!/usr/bin/env node\n"));
  if (process.platform !== "win32") {
    assert.equal(lstatSync(file).mode & 0o777, 0o755);
    assert.equal(realpathSync(join(root, "node_modules", ".bin", name)), file);
  } else {
    // npm uses command shims on Windows, not executable POSIX symlinks.
    assert(
      lstatSync(join(root, "node_modules", ".bin", name + ".cmd")).isFile(),
    );
  }
  assert.equal(
    run(runtime, [...prefix, file, "--version"]).stdout.trim(),
    pkg.version,
  );
  assert.match(run(runtime, [...prefix, file, "--help"]).stdout, /Usage:/i);
  const importProbe = join(root, `import-${name}.mjs`);
  writeFileSync(
    importProbe,
    `await import(${JSON.stringify(`./node_modules/yahoo-finance2/${target}`)}); console.log('import-safe');\n`,
  );
  assert.equal(
    run(runtime, [...prefix, importProbe]).stdout.trim(),
    "import-safe",
  );
  checks += 3;
}
// Real package-manager aliases; offline flags forbid resolution of a new tool.
assert.equal(
  run(
    npmRuntime,
    [
      npm,
      "exec",
      "--offline",
      "--cache",
      join(root, "npm-cache"),
      "--",
      "yahoo-finance2",
      "--version",
    ],
    root,
  ).stdout.trim(),
  pkg.version,
);
assert.equal(
  run(
    bun,
    ["x", "--no-install", "--bun", "yahoo-finance2", "--version"],
    root,
  ).stdout.trim(),
  pkg.version,
);
checks += 2;

/** @type {Array<{shutdown:string,observed:unknown,elapsedMs:number}>} */
const lifecycle = [];
assert(
  protocolScope === "full" || protocolScope === "library-static",
  "Explicit protocol scope required",
);
/** @type {Array<"EOF" | "SIGTERM" | "SIGINT" | "forced">} */
const shutdowns =
  protocolScope === "library-static"
    ? []
    : process.platform === "win32"
      ? ["EOF", "forced"]
      : ["EOF", "SIGTERM", "SIGINT"];
for (const shutdown of shutdowns) {
  const home = join(outside, `native home ${shutdown}`);
  mkdirSync(home, { recursive: true });
  const cookie = join(home, ".yf2-cookies.json");
  writeFileSync(cookie, "{}");
  const mcp = join(installed, pkg.bin["yahoo-finance-mcp"]);
  const homeEnv =
    process.platform === "win32" ? { USERPROFILE: home } : { HOME: home };
  const child = spawn(
    runtime,
    [...prefix, mcp, "--stdio", "--tools", "quote,search"],
    {
      cwd: outside,
      env: { ...env, ...homeEnv },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const frames = new McpFrames();
  let stderr = "";
  /** @type {unknown} */
  let protocolError;
  child.stdout.on("data", (chunk) => {
    try {
      frames.write(chunk);
    } catch (error) {
      protocolError ??= error;
    }
  });
  child.stdout.on("end", () => {
    try {
      frames.end();
    } catch (error) {
      protocolError ??= error;
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let deadline;
  /** @type {Promise<{code:number|null,signal:NodeJS.Signals|null,closeCode:number|null,closeSignal:NodeJS.Signals|null}>} */
  const closed = new Promise((resolve, reject) => {
    /** @type {{code:number|null,signal:NodeJS.Signals|null} | undefined} */
    let exited;
    /** @type {{code:number|null,signal:NodeJS.Signals|null} | undefined} */
    let closeEvent;
    const finish = () => {
      if (exited && closeEvent)
        resolve({
          ...exited,
          closeCode: closeEvent.code,
          closeSignal: closeEvent.signal,
        });
    };
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      exited = { code, signal };
      finish();
    });
    child.once("close", (code, signal) => {
      closeEvent = { code, signal };
      finish();
    });
    deadline = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error("Installed MCP process failed to close within deadline"),
      );
    }, 20000);
  });
  // Handle early spawn/close errors while protocol initialization is in flight.
  void closed.catch(() => {});
  /** @param {number} id */
  async function response(id) {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (protocolError) throw protocolError;
      for (const message of frames.messages) {
        if (message.id === id) return message;
      }
      assert(
        child.exitCode === null && child.signalCode === null,
        `${shutdown}: ${stderr}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("No MCP response: " + stderr);
  }
  /** @param {unknown} message */
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "native-probe", version: "1" },
      },
    });
    assert.equal((await response(1)).result.serverInfo.version, pkg.version);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    assert.deepEqual(
      (await response(2)).result.tools.map(
        /** @param {{name:string}} tool */ (tool) => tool.name,
      ),
      ["quote", "search"],
    );
    const began = Date.now();
    if (shutdown === "EOF") child.stdin.end();
    else assert(child.kill(shutdown === "forced" ? "SIGKILL" : shutdown));
    const observed = await closed;
    if (protocolError) throw protocolError;
    const status = { code: observed.code, signal: observed.signal };
    if (shutdown !== "forced")
      assert.deepEqual(status, { code: 0, signal: null });
    else
      assert.notDeepEqual(
        status,
        { code: 0, signal: null },
        "Forced Windows termination must actually stop the live server",
      );
    assert(
      Date.now() - began < 5000,
      "Installed MCP shutdown exceeded its bound",
    );
    lifecycle.push({ shutdown, observed, elapsedMs: Date.now() - began });
    assert.equal(readFileSync(cookie, "utf8"), "{}");
    assert(lstatSync(cookie).isFile() && !lstatSync(cookie).isSymbolicLink());
    if (process.platform !== "win32")
      assert.equal(statSync(cookie).mode & 0o777, 0o600);
    checks++;
  } finally {
    try {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await closed;
    } finally {
      clearTimeout(deadline);
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
    }
  }
}
console.log(
  JSON.stringify({
    runtime,
    controllerRuntime: process.versions.bun
      ? `Bun ${process.versions.bun}`
      : `Node ${process.versions.node}`,
    platform: process.platform,
    checks,
    aliases: Object.keys(pkg.bin),
    protocolScope,
    mcp: protocolScope === "full" ? ["initialize", "tools/list"] : [],
    omittedMcp:
      protocolScope === "library-static"
        ? "Explicit historical Bun1.0 stdio/termination gap; not a passed protocol control"
        : undefined,
    lifecycle,
    cookieHome:
      protocolScope === "full"
        ? process.platform === "win32"
          ? "USERPROFILE"
          : "HOME"
        : undefined,
    permissions:
      protocolScope === "library-static"
        ? "not exercised in the explicit static scope"
        : process.platform === "win32"
          ? "regular file; no POSIX mode or ACL privacy claim"
          : "0600",
    http: "not attempted; no native socket denial claim",
    signals:
      protocolScope === "library-static"
        ? "not exercised in the explicit static scope"
        : "actual POSIX signals or Windows forced termination as recorded; no console Ctrl-C claim",
  }),
);
