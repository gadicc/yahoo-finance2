// Controlled persistence across real installed executable processes; no Yahoo I/O.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { finished } from "node:stream/promises";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpFrames } from "./native-mcp-frames.mjs";

/** @param {{root:string,installed:string,runtime:string,runtimeKind:string,env:NodeJS.ProcessEnv,preload:string}} options */
export async function probeCookies({
  root,
  installed,
  runtime,
  runtimeKind,
  env,
  preload,
}) {
  const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  const directory = mkdtempSync(join(root, "cookie persistence "));
  const home = join(directory, "home");
  mkdirSync(home);
  const cookie = join(home, ".yf2-cookies.json");
  const log = join(directory, "requests.jsonl");
  const fixture = fileURLToPath(
    new URL("./package-cookie-fetch.mjs", import.meta.url),
  );
  const prefix =
    runtimeKind === "bun"
      ? ["--preload", preload]
      : ["--import", pathToFileURL(preload).href];
  const fixedPrefix = [
    ...prefix,
    ...(runtimeKind === "bun"
      ? ["--preload", fixture]
      : ["--import", pathToFileURL(fixture).href]),
  ];
  const homeEnv = {
    ...env,
    ...(process.platform === "win32" ? { USERPROFILE: home } : { HOME: home }),
  };
  /** @param {string[]} args @param {NodeJS.ProcessEnv} [extra] @param {boolean} [fixed] */
  function run(args, extra = {}, fixed = true) {
    const child = spawnSync(
      runtime,
      [...(fixed ? fixedPrefix : prefix), ...args],
      {
        cwd: directory,
        env: { ...homeEnv, YF_COOKIE_PROBE_LOG: log, ...extra },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.ifError(child.error);
    return child;
  }
  const seed = join(directory, "seed.mjs");
  writeFileSync(
    seed,
    `import{createCookieJar}from${JSON.stringify(pathToFileURL(join(dirname(join(installed, pkg.bin["yahoo-finance2"])), "runtime.js")).href)};
const jar=createCookieJar();await jar.setCookie('crumb=packed-crumb; Path=/','http://config.yf2/');await jar.setCookie('A1=packed-cookie; Domain=.yahoo.com; Path=/','https://finance.yahoo.com/');`,
  );
  assert(!existsSync(cookie));
  const cli = join(installed, pkg.bin["yahoo-finance2"]);
  const created = run([cli, "quote", "PACKED"], {}, false);
  assert.equal(created.status, 1);
  assert.equal(created.stdout, "");
  assert.match(
    created.stderr,
    /Native platform probe requires controlled fetch/,
  );
  function privateCookie() {
    const status = lstatSync(cookie);
    assert(status.isFile() && !status.isSymbolicLink() && status.nlink === 1);
    if (process.platform !== "win32") assert.equal(status.mode & 0o777, 0o600);
  }
  privateCookie();
  const seeded = run([seed], {}, false);
  assert.equal(seeded.status, 0, seeded.stderr);
  privateCookie();
  const inspect = join(directory, "inspect.mjs");
  writeFileSync(
    inspect,
    `import{createCookieJar}from${JSON.stringify(pathToFileURL(join(dirname(join(installed, pkg.bin["yahoo-finance2"])), "runtime.js")).href)};
const jar=createCookieJar();const cookies=[...await jar.getCookies('http://config.yf2/'),...await jar.getCookies('https://finance.yahoo.com/')];console.log(JSON.stringify(Object.fromEntries(cookies.map(c=>[c.key,c.value]))));`,
  );
  /** @param {string} key @param {string} value */
  function stored(key, value) {
    const inspected = run([inspect], {}, false);
    assert.equal(inspected.status, 0, inspected.stderr);
    const data = JSON.parse(inspected.stdout);
    assert.equal(data.crumb, "packed-crumb");
    assert.equal(data.A1, "packed-cookie");
    assert.equal(data[key], value);
  }
  /** @param {unknown} value */
  function validQuote(value) {
    const quote =
      /** @type {{symbol:string,regularMarketPrice:number,regularMarketTime:string}} */ (
        value
      );
    assert.equal(quote.symbol, "PACKED");
    assert.equal(quote.regularMarketPrice, 123.45);
    assert.equal(quote.regularMarketTime, "2023-11-14T22:13:20.000Z");
  }
  for (const phase of ["cli-write", "cli-read"]) {
    const before = readFileSync(cookie, "utf8");
    const result = run([cli, "quote", "PACKED"], {
      YF_COOKIE_PROBE_PHASE: phase,
    });
    assert.equal(result.status, 0, result.stderr);
    validQuote(JSON.parse(result.stdout));
    privateCookie();
    stored("CLI", "cli-persisted");
    if (phase === "cli-read")
      assert.equal(readFileSync(cookie, "utf8"), before);
  }
  const child = spawn(
    runtime,
    [
      ...fixedPrefix,
      join(installed, pkg.bin["yahoo-finance-mcp"]),
      "--stdio",
      "--tools",
      "quote",
    ],
    {
      cwd: directory,
      env: {
        ...homeEnv,
        YF_COOKIE_PROBE_LOG: log,
        YF_COOKIE_PROBE_PHASE: "mcp-write",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const frames = new McpFrames();
  let stderr = "";
  /** @type {unknown} */ let protocolError;
  /** @param {unknown} error */
  const recordError = (error) => {
    protocolError ??= error;
  };
  // write callbacks report failure, but streams also emit error events afterward.
  // Keep listeners through destruction so a late event cannot escape teardown.
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    stream.on("error", recordError);
  }
  child.on("error", recordError);
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
  const closed = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  /** @type {Promise<never>} */
  const timedOut = new Promise((_, reject) => {
    deadline = setTimeout(() => {
      reject(
        new Error("Synthetic MCP cookie process did not close within deadline"),
      );
    }, 20000);
  });
  void timedOut.catch(() => {});
  /** @template T @param {Promise<T>} operation */
  const bounded = (operation) => Promise.race([operation, timedOut]);
  /** @param {number} id */
  async function response(id) {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (protocolError) throw protocolError;
      const found = frames.messages.find((message) => message.id === id);
      if (found) return found;
      assert(child.exitCode === null && child.signalCode === null, stderr);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`No synthetic MCP cookie response: ${stderr}`);
  }
  /** @param {unknown} value */
  async function send(value) {
    if (protocolError) throw protocolError;
    await bounded(
      new Promise((resolve, reject) => {
        child.stdin.write(`${JSON.stringify(value)}\n`, (error) =>
          error ? reject(error) : resolve(undefined),
        );
      }),
    );
    if (protocolError) throw protocolError;
  }
  try {
    await send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "cookie-probe", version: "1" },
      },
    });
    assert.equal((await response(1)).result.serverInfo.version, pkg.version);
    await send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "quote", arguments: { query: "PACKED" } },
    });
    const result = (await response(2)).result;
    assert.equal(result.isError, undefined);
    validQuote(result.structuredContent.result);
    validQuote(JSON.parse(result.content[0].text));
    // finished observes callback/event errors while end drains pending writes.
    const ended = finished(child.stdin, { cleanup: true });
    child.stdin.end();
    await bounded(ended);
    assert.deepEqual(await bounded(closed), { code: 0, signal: null });
    if (protocolError) throw protocolError;
  } finally {
    /** @type {ReturnType<typeof setTimeout> | undefined} */ let cleanupDeadline;
    try {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await Promise.race([
        closed,
        new Promise((_, reject) => {
          cleanupDeadline = setTimeout(
            () =>
              reject(
                new Error(
                  "Synthetic MCP cookie process did not close after cleanup kill",
                ),
              ),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline);
      clearTimeout(cleanupDeadline);
      // Each stream and the child is released even if another destroy fails.
      try {
        child.stdin.destroy();
      } finally {
        try {
          child.stdout.destroy();
        } finally {
          try {
            child.stderr.destroy();
          } finally {
            child.unref();
          }
        }
      }
    }
  }
  privateCookie();
  stored("MCP", "mcp-persisted");
  const before = readFileSync(cookie, "utf8");
  const final = run([cli, "quote", "PACKED"], {
    YF_COOKIE_PROBE_PHASE: "cli-read-mcp",
  });
  assert.equal(final.status, 0, final.stderr);
  validQuote(JSON.parse(final.stdout));
  privateCookie();
  assert.equal(readFileSync(cookie, "utf8"), before);
  stored("CLI", "cli-persisted");
  const invalid = run([cli, "quote", "PACKED"], {
    YF_COOKIE_PROBE_PHASE: "invalid-result",
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /validation/i);
  privateCookie();
  assert.equal(readFileSync(cookie, "utf8"), before);
  const requests = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    requests.map((item) => item.phase),
    ["cli-write", "cli-read", "mcp-write", "cli-read-mcp", "invalid-result"],
  );
  const target = join(directory, "unrelated.json");
  writeFileSync(target, "unrelated private marker");
  if (process.platform !== "win32") chmodSync(target, 0o644);
  const linkedHome = join(directory, "hardlink-home");
  mkdirSync(linkedHome);
  linkSync(target, join(linkedHome, ".yf2-cookies.json"));
  const targetMode = statSync(target).mode;
  assert.equal(statSync(target).nlink, 2);
  for (const file of [cli, join(installed, pkg.bin["yahoo-finance-mcp"])]) {
    const result = run(
      file === cli ? [file, "quote", "PACKED"] : [file, "--stdio"],
      { HOME: linkedHome, USERPROFILE: linkedHome },
      false,
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unable to prepare the private cookie store/);
    assert(!result.stderr.includes("unrelated private marker"));
    assert.equal(readFileSync(target, "utf8"), "unrelated private marker");
    assert.equal(statSync(target).mode, targetMode);
  }
  const reject = join(directory, "reject-fetch.mjs");
  writeFileSync(
    reject,
    `import assert from 'node:assert/strict';for(const url of ['https://finance.yahoo.com/quote/AAPL','https://query2.finance.yahoo.com/v7/finance/quote?symbols=OTHER&crumb=packed-crumb','https://query2.finance.yahoo.com/v7/finance/quote?symbols=PACKED&crumb=packed-crumb&extra=1'])await assert.rejects(fetch(url));const valid='https://query2.finance.yahoo.com/v7/finance/quote?symbols=PACKED&crumb=packed-crumb';await assert.rejects(fetch(valid,{method:'POST'}));await assert.rejects(fetch(valid,{body:'unexpected'}));`,
  );
  const rejected = run([reject], { YF_COOKIE_PROBE_PHASE: "cli-write" });
  assert.equal(rejected.status, 0, rejected.stderr);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 5);
  return {
    separateExecutables: [
      "CLI write",
      "CLI read",
      "MCP tools/call write",
      "CLI read MCP",
    ],
    validatedQuote: "PACKED/123.45/2023-11-14T22:13:20.000Z",
    creation: "actual CLI creates missing file before controlled fetch refusal",
    preservedCookies: ["crumb", "A1", "CLI", "MCP"],
    requestCount: requests.length,
    hardlinkRefusals: 2,
    targetBytesAndModeUnchanged: true,
    unknownRequestsRefused: 5,
    invalidQuoteResultRefused: true,
    permissions:
      process.platform === "win32"
        ? "regular single-link file; no ACL privacy claim"
        : "0600",
    platform: process.platform,
  };
}
