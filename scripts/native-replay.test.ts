import { ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import {
  nativeEnvironment,
  terminateNativeWindows,
  waitNativeChild,
  windowsTreeCommand,
} from "./testing/native.ts";
import { inventory, nativeInventory } from "./testing/inventory.ts";

const launcher = new URL("./test.ts", import.meta.url).href;
const pass =
  "import{test}from'bun:test';test('selected leaf',()=>console.log('SELECTED_LEAF'));";
function workspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "yf-native-command-")));
  const put = (file: string, text: string) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return path;
  };
  const driver = put(
    "driver.mjs",
    `import{existsSync}from'node:fs';import{join}from'node:path';import{runTests,parseArguments}from${JSON.stringify(launcher)};
const root=process.argv[2];const controller=new AbortController();const timer=setInterval(()=>{if(existsSync(join(root,'.stop')))controller.abort('SIGTERM')},20);timer.unref();
try{process.exitCode=await runTests(parseArguments(process.argv.slice(3)),root,controller.signal)}catch(e){console.error(String(e));process.exitCode=2}finally{clearInterval(timer)}`,
  );
  return {
    root,
    put,
    driver,
    run(args: string[] = [], environment: NodeJS.ProcessEnv = {}) {
      const child = spawnSync(
        process.execPath,
        [driver, root, "--native", ...args],
        {
          encoding: "utf8",
          timeout: 20000,
          env: { ...process.env, ...environment },
        },
      );
      if (child.error) throw child.error;
      return { code: child.status, output: child.stdout + child.stderr };
    },
    [Symbol.dispose]() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("native environment clears case-insensitive capture/live controls and Windows tree commands use no shell", () => {
  const env = nativeEnvironment(
    {
      FETCH_DEVEL: "recache",
      fmc_cache_dir: "bad",
      NODE_OPTIONS: "bad",
      BUN_OPTIONS: "bad",
      KEEP: "yes",
    },
    "scratch",
  );
  expect(env).toMatchObject({
    FMC_CACHE_MODE: "replay",
    FETCH_DEVEL: "",
    TMP: "scratch",
    TEMP: "scratch",
    KEEP: "yes",
  });
  expect(env.fmc_cache_dir).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(env.BUN_OPTIONS).toBeUndefined();
  expect(windowsTreeCommand(123, "C:/Windows")).toEqual([
    String.raw`C:\Windows\System32\taskkill.exe`,
    ["/PID", "123", "/T", "/F"],
  ]);
  expect(() => windowsTreeCommand(-123, "C:/Windows")).toThrow(
    "Invalid child PID",
  );
  expect(() => windowsTreeCommand(123, "relative-root")).toThrow(
    "Invalid Windows SystemRoot",
  );
});

test("native inventory discloses omitted tooling and rejects explicit out-of-scope paths", () => {
  using space = workspace();
  space.put("src/a.test.ts", pass);
  space.put("tests/recacheStats.test.ts", pass);
  space.put("scripts/linux.test.ts", "throw Error('DO_NOT_RUN')");
  expect(nativeInventory(inventory(space.root))).toEqual([
    "src/a.test.ts",
    "tests/recacheStats.test.ts",
  ]);
  const listed = space.run(["--list"]);
  expect(listed.code, listed.output).toBe(0);
  expect(listed.output).toContain("omitted 1 tooling files");
  expect(listed.output).toContain("scripts/linux.test.ts");
  const excluded = space.run(["scripts/linux.test.ts"]);
  expect(excluded.code).toBe(2);
  expect(excluded.output).toContain("outside its portable scope");
  expect(excluded.output).not.toContain("DO_NOT_RUN");
  expect(space.run(["--filter", "missing"]).code).toBe(2);
});

test("native replay needs no Python, sanitizes environment and allows controlled fetch stubs", () => {
  using space = workspace();
  space.put(
    "src/spaced path/a.test.ts",
    `import{test,expect}from'bun:test';test('selected leaf',async()=>{
expect(process.env.FMC_CACHE_MODE).toBe('replay');expect(process.env.FETCH_DEVEL).toBe('');expect(process.env.FMC_CACHE_DIR).toBeUndefined();expect(process.env.FETCH_DEVEL_OTHER).toBeUndefined();
expect(()=>fetch('https://example.invalid')).toThrow('Native replay');
expect(()=>Object.defineProperty(globalThis,Symbol.for('yahoo-finance2.capture-session'),{value:{mode:'recache'}})).toThrow();
globalThis.fetch=async()=>new Response('controlled');expect(await(await fetch('https://example.invalid')).text()).toBe('controlled');});`,
  );
  const result = space.run(
    ["--serial", join(space.root, "src/spaced path/a.test.ts")],
    {
      PATH: "/not-a-python-path",
      FETCH_DEVEL: "recache",
      FETCH_DEVEL_OTHER: "live",
      FMC_CACHE_DIR: "bad",
      FMC_CACHE_MODE: "record",
    },
  );
  expect(result.code, result.output).toBe(0);
  expect(existsSync(join(space.root, "tests/fixtures"))).toBe(false);
});

test("native empty/all-skipped/name-miss/failure and timeout exits remain failures", () => {
  using space = workspace();
  expect(space.run().code).toBe(2);
  space.put("src/a.test.ts", pass);
  expect(space.run(["--name", "missing"]).code).not.toBe(0);
  space.put("src/empty.test.ts", "export {};");
  expect(space.run(["src/empty.test.ts"]).code).not.toBe(0);
  space.put(
    "src/skipped.test.ts",
    "import{test}from'bun:test';test.skip('skipped',()=>{});",
  );
  expect(space.run(["src/skipped.test.ts"]).code).not.toBe(0);
  space.put(
    "src/fail.test.ts",
    "import{test}from'bun:test';test('fail',()=>{throw Error('INTENTIONAL')});",
  );
  expect(space.run(["src/fail.test.ts"]).code).toBe(1);
  space.put(
    "src/wait.test.ts",
    "import{test}from'bun:test';test('wait',()=>new Promise(()=>{}));",
  );
  expect(space.run(["src/wait.test.ts", "--timeout", "20"]).code).toBe(1);
  expect(
    space.run([
      "src/wait.test.ts",
      "--timeout",
      "10000",
      "--run-timeout",
      "100",
    ]).code,
  ).toBe(124);
});

test("native fixture snapshot detects writes but does not pretend to deny arbitrary filesystem access", () => {
  using space = workspace();
  space.put("tests/fixtures/http/original.json", "original");
  space.put(
    "src/write.test.ts",
    "import{test}from'bun:test';import{writeFileSync}from'node:fs';test('trusted writer',()=>writeFileSync('tests/fixtures/http/original.json','changed'));",
  );
  const result = space.run();
  expect(result.code).toBe(2);
  expect(result.output).toContain("detected fixture changes");
  expect(
    readFileSync(join(space.root, "tests/fixtures/http/original.json"), "utf8"),
  ).toBe("changed");
});

test("native coverage uses staged metrics and clears stale output on no-match", () => {
  using space = workspace();
  space.put("src/value.ts", "export const value=()=>7;");
  space.put(
    "src/a.test.ts",
    "import{test,expect}from'bun:test';import{value}from'./value.ts';test('source',()=>expect(value()).toBe(7));",
  );
  const result = space.run(["--coverage", "--serial"]);
  expect(result.code, result.output).toBe(0);
  expect(
    readFileSync(join(space.root, "coverage/lcov.info"), "utf8"),
  ).toContain("TN:");
  expect(space.run(["--coverage", "--filter", "missing"]).code).toBe(2);
  expect(existsSync(join(space.root, "coverage/lcov.info"))).toBe(false);
});

test("native watch rediscovers source files and supports portable controlled cancellation", async () => {
  using space = workspace();
  const original = space.put("src/a.test.ts", pass);
  const child = spawn(
    process.execPath,
    [space.driver, space.root, "--native", "--watch", "--serial"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let phase = 0;
  const changed = (chunk: Buffer) => {
    output += chunk.toString();
    const waits = output.match(/fresh native replay restart/g)?.length ?? 0;
    if (phase === 0 && waits === 1) {
      phase++;
      space.put("src/added.test.ts", pass);
    } else if (phase === 1 && waits === 2) {
      phase++;
      rmSync(original);
    } else if (phase === 2 && waits === 3) {
      phase++;
      space.put(
        "package.json",
        JSON.stringify({ private: true, type: "module" }),
      );
    } else if (phase === 3 && waits === 4) {
      phase++;
      space.put("scripts/testing/native-preload.ts", "// watched helper input");
    } else if (phase === 4 && waits === 5) {
      phase++;
      space.put(".stop", "stop");
    }
  };
  child.stdout?.on("data", changed);
  child.stderr?.on("data", changed);
  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    expect(phase, output).toBe(5);
    expect(code, output).toBe(143);
    expect(output).toContain("Native replay: 2 files");
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});

test("native timeout terminates its test process tree", () => {
  using space = workspace();
  space.put(
    "src/tree.test.ts",
    `import{test}from'bun:test';import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';test('tree',async()=>{
const child=spawn(process.execPath,['-e',"setTimeout(()=>require('node:fs').writeFileSync('ORPHAN_SURVIVED','bad'),1200);setInterval(()=>{},1000)"],{stdio:'inherit'});
writeFileSync('descendant-pid',String(child.pid));console.log('TREE_READY');await new Promise(()=>{});});`,
  );
  const result = space.run(["--run-timeout", "300", "--timeout", "10000"]);
  expect(result.code, result.output).toBe(124);
  expect(result.output).toContain("TREE_READY");
  expect(existsSync(join(space.root, "descendant-pid"))).toBe(true);
  // A survivor would create this marker after the runner's deadline. SpawnSync
  // waits in the test parent without blocking the child's independent timer.
  const wait = spawnSync(
    process.execPath,
    ["-e", "await new Promise(r=>setTimeout(r,1400))"],
    { timeout: 5000 },
  );
  expect(wait.status).toBe(0);
  expect(existsSync(join(space.root, "ORPHAN_SURVIVED"))).toBe(false);
});

test("native repository cache ignores live mode overrides and never delegates to an ordinary fetch stub", () => {
  using space = workspace();
  const cacheUrl = new URL("../tests/fetchCache.ts", import.meta.url).href;
  space.put(
    "src/cache.test.ts",
    `import{test,expect}from'bun:test';import cache from ${JSON.stringify(cacheUrl)};
test('repository cache',async()=>{let calls=0;globalThis.fetch=async()=>{calls++;return new Response('forbidden')};
for(const mode of ['record','off','auto']){cache.once({id:'native-deliberately-missing',mode,readCache:false,writeCache:true});await expect(cache('https://example.invalid/missing',undefined)).rejects.toThrow('Offline replay forbids network')}
expect(calls).toBe(0);expect(cache._store.constructor.name).toBe('ReplayStore');
await expect(cache._store.storeContent({request:{url:'https://example.invalid'},response:{ok:true,status:200,statusText:'OK',headers:{}}},{writeCache:true})).rejects.toThrow('read-only');});`,
  );
  const result = space.run();
  expect(result.code, result.output).toBe(0);
  expect(existsSync(join(space.root, "tests/fixtures"))).toBe(false);
});

test("Windows cleanup failures and exited-parent held-stdio cannot leave completion unbounded", async () => {
  for (const scenario of ["exited", "taskkill-failed", "close-race"] as const) {
    const child = new ChildProcess();
    Object.defineProperty(child, "pid", { value: 123 });
    Object.defineProperty(child, "exitCode", {
      value: scenario === "exited" ? 0 : null,
    });
    let unref = false;
    child.unref = () => {
      unref = true;
    };
    child.kill = () => true;
    const started = Date.now();
    const controls =
      scenario === "exited"
        ? {}
        : {
            terminateWindows: () =>
              terminateNativeWindows(child, (_command, args) => {
                expect(args).toEqual(["/PID", "123", "/T", "/F"]);
                if (scenario === "close-race") child.emit("close", 1, null);
                return { status: 1 };
              }),
          };
    await expect(
      waitNativeChild(child, new AbortController().signal, 10, {
        platform: "win32",
        closeTimeout: 20,
        ...controls,
      }),
    ).rejects.toThrow(
      scenario === "exited"
        ? "exited before tree cleanup"
        : "Native Windows process-tree cleanup failed",
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(unref).toBe(scenario !== "close-race");
  }
});
