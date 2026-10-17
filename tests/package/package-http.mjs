// Copy into a real installed scratch consumer. Run only through workers-loopback.py.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/** @type {string} */
const publicHttp = "yahoo-finance2/mcp/http";
// Source contract is checked in the root; execution resolves the real installed package.
/** @type {Pick<typeof import("../../src/mcp/http.ts"), "createYahooFinanceMcpNodeHandler" | "createYahooFinanceMcpWebHandler">} */
const { createYahooFinanceMcpNodeHandler, createYahooFinanceMcpWebHandler } =
  await import(publicHttp);

const consumer = dirname(fileURLToPath(import.meta.url));
const runtime = process.argv[2];
const output = process.argv[3];
assert(
  runtime && output,
  "Usage: package-http.mjs ABSOLUTE_RUNTIME OUTPUT_JSON",
);
const boundary = JSON.parse(process.env.YF_WORKERS_SANDBOX_STATE ?? "null");
assert.deepEqual(
  boundary?.interfaces,
  ["lo"],
  "Use the reviewed isolated-loopback launcher",
);
assert.equal(boundary.external.ipv4, "ENETUNREACH");
assert.equal(boundary.external.ipv6, "ENETUNREACH");
const pkg = JSON.parse(
  readFileSync(
    join(consumer, "node_modules/yahoo-finance2/package.json"),
    "utf8",
  ),
);
const bin = join(consumer, "node_modules/.bin/yahoo-finance-mcp");
const outside = mkdtempSync(join(consumer, "http-outside-"));
const token = "g04-cli-token-SENTINEL";
const envToken = "g04-env-token-SENTINEL";
/** @type {Array<{name:string,detail?:unknown}>} */
const checks = [];
/** @param {string} name @param {unknown} [detail] */
function passed(name, detail) {
  checks.push({ name, ...(detail === undefined ? {} : { detail }) });
}
/** @param {() => boolean} predicate @param {string} message */
async function until(predicate, message) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
let nextHome = 0;
/** @param {string[]} args @param {NodeJS.ProcessEnv} [extra] @param {boolean} [home] */
function child(args, extra = {}, home = true) {
  const directory = join(outside, "home-" + nextHome++);
  if (home) mkdirSync(directory);
  /** @type {NodeJS.ProcessEnv} */
  const env = {
    ...process.env,
    ...extra,
    PATH: dirname(runtime) + ":" + process.env.PATH,
  };
  for (const key of ["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"])
    delete env[key];
  if (home) env.HOME = directory;
  const childProcess = spawn(runtime, [bin, ...args], {
    cwd: outside,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "";
  childProcess.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  childProcess.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exit = once(childProcess, "close");
  return {
    process: childProcess,
    exit,
    directory,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}
/** @param {ReturnType<typeof child>} c */
function noSecrets(c) {
  assert(!c.stdout().includes(token) && !c.stderr().includes(token));
  assert(!c.stdout().includes(envToken) && !c.stderr().includes(envToken));
}
/** @param {ReturnType<typeof child>} c */
async function disposed(c) {
  if (c.process.exitCode === null && c.process.signalCode === null)
    c.process.kill("SIGKILL");
  await c.exit;
}
/** @param {string[]} args @param {number} code @param {NodeJS.ProcessEnv} [env] @param {boolean} [home] */
async function failure(args, code, env = {}, home = true) {
  const c = child(args, env, home);
  try {
    await until(
      () => c.process.exitCode !== null || c.process.signalCode !== null,
      "CLI did not fail",
    );
    assert.equal(c.process.exitCode, code, c.stderr());
    assert.equal(c.process.signalCode, null);
    assert.equal(c.stdout(), "");
    noSecrets(c);
    return c.stderr();
  } finally {
    await disposed(c);
  }
}
/** @param {string[]} [args] @param {NodeJS.ProcessEnv} [env] */
async function listening(args = [], env = {}) {
  const c = child(
    ["--http", "--port", "0", "--tools", "quote,search", ...args],
    env,
  );
  try {
    await until(
      () =>
        /listening on http:.*:(\d+)\//.test(c.stderr()) ||
        c.process.exitCode !== null,
      "HTTP startup timed out",
    );
    assert.equal(c.process.exitCode, null, c.stderr());
    const match = /listening on http:.*:(\d+)\//.exec(c.stderr());
    assert(match, c.stderr());
    noSecrets(c);
    return { ...c, port: Number(match[1]) };
  } catch (error) {
    await disposed(c);
    throw error;
  }
}
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "g04-packed-probe", version: "1" },
  },
};
/** @param {number} port @param {unknown} [body] @param {Record<string,string>} [headers] @param {string} [path] @param {string} [method] @param {string} [connectionHost] @returns {Promise<{status:number|undefined,text:string}>} */
async function http(
  port,
  body = initialize,
  headers = {},
  path = "/mcp",
  method = "POST",
  connectionHost = "127.0.0.1",
) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        host: connectionHost,
        port,
        path,
        method,
        headers: {
          Host: "localhost",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(payload),
          Connection: "close",
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, text }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("HTTP probe timeout")));
    req.end(payload);
  });
}
/** @param {number} port @param {string[]} fields @param {string} [path] @returns {Promise<{status:number,text:string}>} */
async function raw(port, fields, path = "/mcp") {
  const payload = JSON.stringify(initialize);
  return await new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let text = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      text += chunk;
    });
    socket.on("error", reject);
    socket.setTimeout(5000, () =>
      socket.destroy(new Error("Raw HTTP probe timeout")),
    );
    socket.on("end", () =>
      resolve({ status: Number(text.split(" ")[1]), text }),
    );
    socket.on("connect", () =>
      socket.end(
        `POST ${path} HTTP/1.1\r\n${fields.join("\r\n")}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`,
      ),
    );
  });
}
/** @param {number} port @param {string} [host] */
async function refused(port, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    const socket = connect(port, host);
    socket.on("error", (error) => {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ECONNREFUSED")
        resolve(undefined);
      else reject(error);
    });
    socket.on("connect", () => {
      socket.destroy();
      reject(new Error("Listener survived shutdown"));
    });
    socket.setTimeout(3000, () =>
      socket.destroy(new Error("Shutdown connection timeout")),
    );
  });
}

// Every protocol message is local. No tools/call can reach the real Yahoo client.
for (const shutdown of ["eof", "SIGTERM", "SIGINT"]) {
  const c = child(["--stdio", "--tools", "quote,search"]);
  /** @param {unknown} message */
  const send = (message) =>
    c.process.stdin.write(JSON.stringify(message) + "\n");
  /** @param {number} id */
  const response = async (id) => {
    await until(
      () =>
        c
          .stdout()
          .split("\n")
          .filter(Boolean)
          .some((line) => JSON.parse(line).id === id),
      "stdio response timed out: " + c.stderr(),
    );
    return c
      .stdout()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((message) => message.id === id);
  };
  try {
    send(initialize);
    assert.equal((await response(1)).result.serverInfo.version, pkg.version);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    assert.deepEqual(
      (await response(2)).result.tools.map(
        /** @param {{name:string}} tool */ (tool) => tool.name,
      ),
      ["quote", "search"],
    );
    send({ jsonrpc: "2.0", id: 3, method: "g04/unknown", params: {} });
    assert.equal((await response(3)).error.code, -32601);
    send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "quote", arguments: { query: 42 } },
    });
    const invalid = await response(4);
    assert.equal(invalid.result.isError, true);
    assert.match(invalid.result.content[0].text, /[Ii]nvalid|validation/);
    if (shutdown === "eof") c.process.stdin.end();
    else c.process.kill(/** @type {NodeJS.Signals} */ (shutdown));
    await until(
      () => c.process.exitCode !== null || c.process.signalCode !== null,
      "stdio shutdown timed out",
    );
    assert.equal(c.process.exitCode, 0, c.stderr());
    assert.equal(c.process.signalCode, null);
    for (const line of c.stdout().split("\n").filter(Boolean))
      assert.equal(JSON.parse(line).jsonrpc, "2.0");
    assert.equal(
      statSync(join(c.directory, ".yf2-cookies.json")).mode & 0o777,
      0o600,
    );
    noSecrets(c);
    passed("packed stdio initialize/list/protocol+input errors/" + shutdown);
  } finally {
    await disposed(c);
  }
}
for (const shutdown of ["SIGTERM", "SIGINT"]) {
  const c = await listening();
  try {
    assert.equal((await http(c.port)).status, 200);
    const listed = await http(c.port, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    assert.equal(listed.status, 200);
    assert.deepEqual(
      JSON.parse(listed.text).result.tools.map(
        /** @param {{name:string}} tool */ (tool) => tool.name,
      ),
      ["quote", "search"],
    );
    assert.equal((await http(c.port, initialize, {}, "/wrong")).status, 404);
    assert.equal((await http(c.port, "{invalid")).status, 400);
    assert.equal(
      (await http(c.port, initialize, {}, "/mcp", "PUT")).status,
      405,
    );
    assert.equal(
      (
        await http(c.port, initialize, {
          Origin: "https://deliberately-unchecked.test",
        })
      ).status,
      200,
    );
    for (const host of [
      "localhost",
      "LOCALHOST:80",
      "127.0.0.1:65535",
      "[::1]",
      "[::1]:3000",
    ]) {
      assert.equal(
        (await http(c.port, initialize, { Host: host })).status,
        200,
        host,
      );
    }
    for (const host of [
      "evil.example",
      "localhost,evil.example",
      "[::1]evil.example",
      "[::1]:80evil",
      "localhost:notaport",
      "localhost:65536",
      "::1",
      "localhost:",
      "localhost@evil.example",
    ]) {
      const denied = await http(c.port, initialize, { Host: host });
      assert.equal(denied.status, 403, host);
      assert.match(denied.text, /Invalid Host header/);
    }
    assert.equal(
      (await raw(c.port, ["Host: localhost", "Host: evil.example"])).status,
      403,
    );
    const missing = await raw(c.port, []);
    assert(
      [400, 403].includes(missing.status),
      "Missing Host must be refused by parser or handler",
    );
    const idle = connect(c.port, "127.0.0.1");
    await once(idle, "connect");
    idle.setEncoding("utf8");
    let idleResponse = "";
    idle.on("data", (chunk) => {
      idleResponse += chunk;
    });
    idle.on("error", () => {});
    const idleClosed = new Promise((resolve) => idle.once("close", resolve));
    const acceptedPayload = JSON.stringify(initialize);
    idle.write(
      `POST /mcp HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nConnection: keep-alive\r\nContent-Length: ${Buffer.byteLength(acceptedPayload)}\r\n\r\n${acceptedPayload}`,
    );
    // Prove this is an accepted HTTP connection before it becomes idle.
    await until(
      () => idleResponse.includes('"serverInfo"'),
      "Idle HTTP connection was never accepted",
    );
    assert.equal(idle.destroyed, false);
    const incomplete = connect(c.port, "127.0.0.1");
    await once(incomplete, "connect");
    incomplete.resume();
    incomplete.on("error", () => {});
    const incompleteClosed = new Promise((resolve) =>
      incomplete.once("close", resolve),
    );
    incomplete.write(
      "POST /mcp HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\nx",
    );
    c.process.kill(/** @type {NodeJS.Signals} */ (shutdown));
    await until(
      () => c.process.exitCode !== null || c.process.signalCode !== null,
      "HTTP shutdown timed out",
    );
    assert.equal(c.process.exitCode, 0, c.stderr());
    assert.equal(c.process.signalCode, null);
    await until(
      () => idle.destroyed && incomplete.destroyed,
      "HTTP connections survived shutdown",
    );
    await Promise.all([idleClosed, incompleteClosed]);
    await refused(c.port);
    assert.equal(c.stdout(), "");
    noSecrets(c);
    passed(
      "packed HTTP protocol/Host/path/errors/active+idle connection shutdown/" +
        shutdown,
      { missingHostStatus: missing.status },
    );
  } finally {
    await disposed(c);
  }
}
for (const host of ["localhost", "::1"]) {
  const c = await listening(["--host", host]);
  try {
    assert.equal(
      (
        await http(
          c.port,
          initialize,
          { Host: host === "::1" ? "[::1]:" + c.port : "localhost" },
          "/mcp",
          "POST",
          host,
        )
      ).status,
      200,
    );
    c.process.kill("SIGTERM");
    await c.exit;
    assert.equal(c.process.exitCode, 0);
    await refused(c.port, host);
    noSecrets(c);
    passed("actual local bind/initialize/shutdown", { host });
  } finally {
    await disposed(c);
  }
}
for (const auth of ["cli", "environment", "precedence"]) {
  const c = await listening(
    auth === "environment" ? [] : ["--token", token],
    auth === "cli" ? {} : { YAHOO_FINANCE_MCP_TOKEN: envToken },
  );
  const expected = auth === "environment" ? envToken : token;
  try {
    for (const value of [
      undefined,
      "Bearer wrong",
      "bearer " + expected,
      "Bearer " + expected + "x",
      "Basic " + expected,
    ]) {
      const result = await http(
        c.port,
        initialize,
        value === undefined ? {} : { Authorization: value },
        "/mcp?redaction=" + token,
      );
      assert.equal(result.status, 401);
      assert(!result.text.includes(token) && !result.text.includes(envToken));
    }
    assert.equal(
      (await http(c.port, initialize, { Authorization: "Bearer " + expected }))
        .status,
      200,
    );
    if (auth === "precedence")
      assert.equal(
        (
          await http(c.port, initialize, {
            Authorization: "Bearer " + envToken,
          })
        ).status,
        401,
      );
    passed("packed bearer missing/wrong/scheme/length/valid/" + auth);
  } finally {
    c.process.kill("SIGTERM");
    await c.exit;
    assert.equal(c.process.exitCode, 0);
    noSecrets(c);
  }
}
for (const host of ["0.0.0.0", "::", "192.0.2.1"]) {
  assert.match(
    await failure(
      ["--http", "--host", host],
      2,
      { YAHOO_FINANCE_MCP_TOKEN: "" },
      false,
    ),
    /Refusing to bind/,
  );
}
passed("nonlocal no-token refusal before HOME/cookie access");
for (const args of [["--unsafe-no-token"], ["--token", token]]) {
  const c = await listening(["--host", "0.0.0.0", ...args]);
  try {
    assert.equal(
      (
        await http(c.port, initialize, {
          Host: "remote.example",
          ...(args[0] === "--token"
            ? { Authorization: "Bearer " + token }
            : {}),
        })
      ).status,
      200,
    );
    passed("explicit nonlocal opt-in", {
      mode: args[0],
      stillPrivateNetworkNamespace: true,
    });
  } finally {
    c.process.kill("SIGTERM");
    await c.exit;
    noSecrets(c);
  }
}
const occupied = createServer();
await new Promise((resolve) =>
  occupied.listen(0, "127.0.0.1", () => resolve(undefined)),
);
try {
  const address = occupied.address();
  assert(address && typeof address !== "string");
  const diagnostic = await failure(
    ["--http", "--port", String(address.port), "--token", token],
    1,
  );
  assert.match(diagnostic, /Unable to start the MCP HTTP server/);
  passed("occupied HTTP port sanitized startup failure");
} finally {
  await new Promise((resolve) => occupied.close(() => resolve(undefined)));
}
assert.match(
  await failure(["--http", "--host", "192.0.2.1", "--token", token], 1),
  /Unable to start/,
);
assert.match(
  await failure(["--http", "--token", token], 1, {}, false),
  /HOME environment variable/,
);
for (const args of [
  ["--token"],
  ["--token", ""],
  ["--token=" + token],
  ["--port", "65536"],
  ["--path", "wrong"],
])
  await failure(args, 2);
passed(
  "bad bind/HOME/missing-token/unknown-secret-option/port/path startup errors",
);

// Public HTTP APIs expose Origin policy; the executable intentionally has no Origin option.
const fake = {
  quote: async () => ({ symbol: "CONTROLLED", regularMarketPrice: 123 }),
};
const settings = {
  client: fake,
  enabledTools: ["quote"],
  bearerToken: token,
  allowedOrigins: ["https://client.test"],
};
const handler = createYahooFinanceMcpNodeHandler(settings);
const server = createServer(
  (req, res) =>
    void handler(req, res).catch(() => {
      res.writeHead(500);
      res.end("probe-handler-error");
    }),
);
await new Promise((resolve) =>
  server.listen(0, "127.0.0.1", () => resolve(undefined)),
);
try {
  const address = server.address();
  assert(address && typeof address !== "string");
  for (const origin of [
    undefined,
    "https://client.test",
    "https://wrong.test",
  ]) {
    const result = await http(address.port, initialize, {
      Authorization: "Bearer " + token,
      ...(origin ? { Origin: origin } : {}),
    });
    assert.equal(result.status, origin === "https://wrong.test" ? 403 : 200);
  }
  const result = await http(
    address.port,
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "quote", arguments: { query: "CONTROLLED" } },
    },
    { Authorization: "Bearer " + token, Origin: "https://client.test" },
  );
  assert.equal(result.status, 200);
  assert.equal(
    JSON.parse(result.text).result.structuredContent.result.symbol,
    "CONTROLLED",
  );
  const malformed = await raw(
    address.port,
    ["Host: localhost"],
    "http://[/" + token,
  );
  assert.equal(malformed.status, 400);
  assert(!malformed.text.includes(token));
  passed(
    "public Node handler Origin allow-list/absent Origin/controlled tools-call/sanitized malformed target",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(() => resolve(undefined)));
}
const web = createYahooFinanceMcpWebHandler(settings);
for (const origin of [undefined, "https://client.test", "https://wrong.test"]) {
  const result = await web(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        Host: "localhost",
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(initialize),
    }),
  );
  assert.equal(result.status, origin === "https://wrong.test" ? 403 : 200);
  await result.text();
}
passed("public web handler explicit Origin policy");
const report = {
  runtime,
  probeHost: {
    runtime: process.versions.bun
      ? "Bun " + process.versions.bun
      : "Node " + process.versions.node,
    nodeCompatibilityVersion: process.version,
  },
  sdk: JSON.parse(
    readFileSync(
      join(consumer, "node_modules/@modelcontextprotocol/sdk/package.json"),
      "utf8",
    ),
  ).version,
  packageVersion: pkg.version,
  platform: process.platform,
  arch: process.arch,
  boundary,
  cwd: outside,
  bin,
  checks,
  passed: checks.length,
  noYahooCalls: true,
  hostPathnameUnixIpcIsolationClaimed: false,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({ runtime, checks: checks.length, sdk: report.sdk }),
);
