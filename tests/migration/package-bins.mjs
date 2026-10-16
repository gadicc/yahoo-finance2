// Copy beside package-consumer.mjs in a freshly installed scratch consumer.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
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

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(root, "node_modules/yahoo-finance2/package.json"), "utf8"),
);
const outside = join(root, "outside");
mkdirSync(outside, { recursive: true });
const runtime = process.argv[2];
const npm = process.argv[3];
const bun = process.argv[4];
const npmRuntime = process.argv[5] ?? runtime;
assert(runtime && npm && bun, "Usage: node bins.mjs RUNTIME NPM_CLI_JS BUN");
/** @type {NodeJS.ProcessEnv} */
const environment = {
  ...process.env,
  PATH: dirname(runtime) + delimiter + process.env.PATH,
};
for (const name of ["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"])
  delete environment[name];
/** @param {string} stderr */
function jsonWarningOnly(stderr) {
  if (!stderr) return;
  const lines = stderr.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(
    lines[0],
    /^\(node:\d+\) ExperimentalWarning: Importing JSON modules is an experimental feature and might change at any time$/,
  );
  assert.equal(
    lines[1],
    "(Use `node --trace-warnings ...` to show where the warning was created)",
  );
}
let checks = 0;
/** @param {string} executable @param {string[]} args */
function run(executable, args, cwd = outside) {
  const child = spawnSync(executable, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.ifError(child.error);
  assert.equal(
    child.status,
    0,
    JSON.stringify({
      executable,
      args,
      status: child.status,
      stdout: child.stdout,
      stderr: child.stderr,
    }),
  );
  checks++;
  return child;
}
for (const [name, target] of Object.entries(pkg.bin)) {
  const file = join(root, "node_modules/yahoo-finance2", target);
  assert.equal(lstatSync(file).mode & 0o777, 0o755);
  assert(readFileSync(file, "utf8").startsWith("#!/usr/bin/env node\n"));
  const alias = join(root, "node_modules/.bin", name);
  assert.equal(realpathSync(alias), file);
  const version = run(runtime, [alias, "--version"]);
  assert.equal(version.stdout.trim(), pkg.version);
  jsonWarningOnly(version.stderr);
  const help = run(runtime, [alias, "--help"]);
  assert.match(help.stdout, /Usage:/i);
  jsonWarningOnly(help.stderr);
  // Importing generated bins must not create a client, cookie file or transport.
  const imported = run(runtime, [
    "--input-type=module",
    "-e",
    `await import(${JSON.stringify(pathToFileURL(file).href)}); console.log("import-safe");`,
  ]);
  assert.equal(imported.stdout.trim(), "import-safe");
}
const exec = run(
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
);
assert.equal(exec.stdout.trim(), pkg.version);
const inferred = run(
  npmRuntime,
  [
    npm,
    "exec",
    "--offline",
    "--cache",
    join(root, "npm-cache"),
    "--",
    "yahoo-finance2",
    "--help",
  ],
  root,
);
assert.match(inferred.stdout, /Usage:/i);
const bunExec = run(
  bun,
  ["x", "--no-install", "--bun", "yahoo-finance2", "--version"],
  root,
);
assert.equal(bunExec.stdout.trim(), pkg.version);
const mcp = join(root, "node_modules/.bin/yahoo-finance-mcp");
for (const shutdown of /** @type {Array<"eof" | "SIGTERM" | "SIGINT">} */ ([
  "eof",
  "SIGTERM",
  "SIGINT",
])) {
  const home = join(outside, "mcp-" + shutdown);
  mkdirSync(home, { recursive: true });
  const cookie = join(home, ".yf2-cookies.json");
  writeFileSync(cookie, "{}");
  const child = spawn(runtime, [mcp, "--stdio", "--tools", "quote,search"], {
    cwd: outside,
    env: { ...environment, HOME: home },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  /** @param {number} id */
  const response = async (id) => {
    const deadline = Date.now() + 8000;
    while (true) {
      for (const line of stdout.split("\n").filter(Boolean)) {
        const message = JSON.parse(line);
        if (message.id === id) return message;
      }
      if (
        child.exitCode !== null ||
        child.signalCode !== null ||
        Date.now() > deadline
      ) {
        throw new Error("Packed MCP child did not respond: " + stderr);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
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
        clientInfo: { name: "packed-offline-probe", version: "1" },
      },
    });
    const initialized = await response(1);
    assert.equal(initialized.result.serverInfo.name, "yahoo-finance2");
    assert.equal(initialized.result.serverInfo.version, pkg.version);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    assert.deepEqual(
      (await response(2)).result.tools.map(
        /** @param {{name: string}} tool */ (tool) => tool.name,
      ),
      ["quote", "search"],
    );
    if (shutdown === "eof") child.stdin.end();
    else child.kill(shutdown);
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    jsonWarningOnly(stderr);
    assert.equal(readFileSync(cookie, "utf8"), "{}");
    assert.equal(statSync(cookie).mode & 0o777, 0o600);
    checks++;
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
  }
}
const httpHome = join(outside, "mcp-http");
mkdirSync(httpHome, { recursive: true });
writeFileSync(join(httpHome, ".yf2-cookies.json"), "{}");
const http = spawnSync(
  runtime,
  [mcp, "--http", "--host", "127.0.0.1", "--port", "0"],
  {
    cwd: outside,
    env: { ...environment, HOME: httpHome },
    encoding: "utf8",
    timeout: 15000,
  },
);
assert.ifError(http.error);
assert.equal(http.status, 1);
assert.equal(http.stdout, "");
assert.match(http.stderr, /Unable to start the MCP HTTP server\./);
checks++;
console.log(
  JSON.stringify({
    runtime,
    npmRuntime,
    checks,
    aliases: Object.keys(pkg.bin),
    outsideCwd: true,
    importSafe: true,
    npmExec: true,
    bunExec: true,
    mcpStdio: ["initialize", "tools/list", "EOF", "SIGTERM", "SIGINT"],
    httpSocketDenied: true,
  }),
);
