import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { inventory, select } from "./testing/inventory.ts";
import { fingerprint, parseArguments } from "./test.ts";

const launcher = new URL("./test.ts", import.meta.url).href;
const guard = fileURLToPath(new URL("./testing/offline.py", import.meta.url));
const pass =
  `import {test,expect} from 'bun:test'; test('selected leaf',()=> { expect(1).toBe(1); console.log('SELECTED_LEAF'); });`;
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "yf-command-"));
  const put = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  const driver = put(
    "driver.mjs",
    `import {main} from ${
      JSON.stringify(launcher)
    };process.exitCode=await main(process.argv.slice(3),process.argv[2]);`,
  );
  return {
    root,
    put,
    driver,
    run(args: string[], environment: NodeJS.ProcessEnv = {}) {
      const child = spawnSync(process.execPath, [driver, root, ...args], {
        cwd: tmpdir(),
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, ...environment },
      });
      if (child.error) throw child.error;
      return { code: child.status, output: child.stdout + child.stderr };
    },
    [Symbol.dispose]() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("inventory is recursive, sorted, and excludes Workers, generated files and symlinks", () => {
  using space = workspace();
  space.put("src/z.test.ts", pass);
  space.put("tests/nested folder/a.test.ts", pass);
  space.put("scripts/worker.test.ts", pass);
  for (
    const path of [
      "tests/cloudflare/worker.test.ts",
      "src/node_modules/a.test.ts",
      "tests/fixtures/a.test.ts",
      "src/generated/a.test.ts",
      "coverage/a.test.ts",
      "npm/a.test.ts",
    ]
  ) space.put(path, pass);
  symlinkSync(
    join(space.root, "src"),
    join(space.root, "tests", "linked"),
    "dir",
  );
  expect(inventory(space.root)).toEqual([
    "scripts/worker.test.ts",
    "src/z.test.ts",
    "tests/nested folder/a.test.ts",
  ]);
  using linkedRoot = workspace();
  symlinkSync(join(space.root, "src"), join(linkedRoot.root, "src"), "dir");
  expect(inventory(linkedRoot.root)).toEqual([]);
  expect(linkedRoot.run([]).code).toBe(2);
  expect(select(space.root, inventory(space.root), ["."], "nested")).toEqual([
    "tests/nested folder/a.test.ts",
  ]);
  expect(() => select(space.root, inventory(space.root), ["../escape"]))
    .toThrow("outside");
});

test("strict options reject weakening flags and invalid selections", () => {
  for (
    const args of [
      ["--parallel=99"],
      ["--pass-with-no-tests"],
      ["--preload", "escape.ts"],
      ["--timeout", "0"],
      ["--timeout=-1"],
      ["--filter"],
      ["--serial=yes"],
      ["--name", "["],
    ]
  ) {
    expect(() => parseArguments(args), args.join(" ")).toThrow();
  }
  expect(parseArguments(["--name=--help"]).name).toBe("--help");
  expect(parseArguments(["--filter=--flag"]).filter).toBe("--flag");
  expect(parseArguments(["--name=a=b", "--serial", "--timeout=42"]).name).toBe(
    "a=b",
  );
  using space = workspace();
  const empty = space.run([]);
  expect(empty.code).toBe(2);
  expect(empty.output).toContain("No test files selected");
  space.put("src/a.test.ts", pass);
  const unknown = space.run(["--not-supported"]);
  expect(unknown.code).toBe(2);
  expect(unknown.output).toContain("Unknown test option");
  expect(space.run(["--filter", "missing"]).code).toBe(2);
});

test("launcher selects spaced/absolute paths outside cwd and clears inherited capture settings", () => {
  using space = workspace();
  const path = space.put(
    "src/nested path/space name.test.ts",
    `import{test,expect}from'bun:test';test('selected leaf',()=>{
    expect(process.env.FETCH_DEVEL).toBe('');expect(process.env.FMC_CACHE_MODE).toBe('replay');
    expect(process.env.FETCH_DEVEL_OTHER).toBeUndefined();expect(process.env.FMC_CACHE_DIR).toBeUndefined();
    console.log('REPLAY_ENV_VALID');});`,
  );
  space.put(
    "src/unselected.test.ts",
    "throw new Error('WRONG_FILE_SELECTED');",
  );
  const result = space.run(["--serial", path, "--name", "selected leaf"], {
    FETCH_DEVEL: "recache",
    FETCH_DEVEL_OTHER: "bad",
    FMC_CACHE_MODE: "record",
    FMC_CACHE_DIR: "bad",
  });
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("REPLAY_ENV_VALID");
  expect(result.output).not.toContain("WRONG_FILE_SELECTED");
});

test("empty files, unmatched names and failed leaves never report success", () => {
  using space = workspace();
  space.put("src/empty.test.ts", "export {};");
  expect(space.run(["src/empty.test.ts"]).code).not.toBe(0);
  space.put("src/pass.test.ts", pass);
  expect(space.run(["src/pass.test.ts", "--name", "no such leaf"]).code).not
    .toBe(0);
  space.put(
    "src/mixed.test.ts",
    "import{test}from'bun:test';test('before',()=>{throw Error('UNSELECTED')});test('selected',()=>{});test('after',()=>{throw Error('UNSELECTED')});",
  );
  const mixed = space.run(["src/mixed.test.ts", "--name", "^selected$"]);
  expect(mixed.code, mixed.output).toBe(0);
  expect(mixed.output).not.toContain("No tests executed");
  space.put(
    "src/skipped.test.ts",
    "import{test}from'bun:test';test.skip('skipped',()=>{});",
  );
  expect(space.run(["src/skipped.test.ts"]).code).not.toBe(0);
  space.put(
    "src/fail.test.ts",
    "import{test}from'bun:test';test('failure',()=>{throw new Error('INTENTIONAL_FAILURE')});",
  );
  const result = space.run(["src/fail.test.ts"]);
  expect(result.code).toBe(1);
  expect(result.output).toContain("INTENTIONAL_FAILURE");
});

test("per-test and whole-run timeouts retain failure status", () => {
  using space = workspace();
  space.put(
    "src/pending.test.ts",
    "import{test}from'bun:test';test('pending',()=>new Promise(()=>{}));",
  );
  const perTest = space.run(["--timeout", "20"]);
  expect(perTest.code).toBe(1);
  expect(perTest.output).toContain("timed out after 20ms");
  const whole = space.run(["--run-timeout", "100", "--timeout", "10000"]);
  expect(whole.code).toBe(124);
  expect(whole.output).toContain("Test run timed out after 100ms");
});

test("Linux guard denies all fixture mutation forms and inherited raw sockets/io_uring", () => {
  using space = workspace();
  const fixture = space.put(
    "tests/fixtures/http/success.json",
    '{"success":true}',
  );
  const probe = space.put(
    "probe.py",
    `import os,pathlib,socket,subprocess,sys,ctypes,errno
fixture=pathlib.Path(sys.argv[1]); directory=fixture.parent
operations=[lambda:fixture.write_text('bad'),lambda:open(fixture,'a').write('bad'),lambda:fixture.rename(directory/'renamed'),lambda:fixture.unlink(),lambda:(directory/'new.json').write_text('bad'),lambda:fixture.chmod(0o777),lambda:(fixture.chmod(0o666),fixture.write_text('bad')),lambda:(directory/'new-directory').mkdir()]
for operation in operations:
 try: operation(); raise RuntimeError('WRITE_BYPASS')
 except OSError as error: assert error.errno in (errno.EROFS,errno.EACCES,errno.EPERM),error
for family in (socket.AF_INET,socket.AF_INET6):
 try: socket.socket(family,socket.SOCK_STREAM);raise RuntimeError('SOCKET_BYPASS')
 except OSError as error: assert error.errno==errno.EPERM,error
libc=ctypes.CDLL(None,use_errno=True)
assert libc.syscall(425,1,0)==-1 and ctypes.get_errno()==errno.EPERM,'IO_URING_BYPASS'
if len(sys.argv)==2: subprocess.run([sys.executable,__file__,str(fixture),'child'],check=True)
print('GUARD_PROBE_PASSED')
`,
  );
  const scratch = mkdtempSync(join(tmpdir(), "yf-guard-scratch-"));
  try {
    const child = spawnSync("python3", [
      guard,
      space.root,
      scratch,
      "--",
      "/usr/bin/python3",
      probe,
      fixture,
    ], { encoding: "utf8", timeout: 20_000 });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.match(/GUARD_PROBE_PASSED/g)).toHaveLength(2);
    expect(readFileSync(fixture, "utf8")).toBe('{"success":true}');
    const descriptor = openSync(fixture, "r+");
    try {
      const inherited = spawnSync("python3", [
        guard,
        space.root,
        scratch,
        "--",
        "/usr/bin/python3",
        "-c",
        `
import os,errno
try:os.write(3,b'BYPASS');raise RuntimeError('INHERITED_FD_BYPASS')
except OSError as error:assert error.errno==errno.EBADF,error
`,
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe", descriptor] });
      expect(inherited.status, inherited.stderr).toBe(0);
      expect(readFileSync(fixture, "utf8")).toBe('{"success":true}');
    } finally {
      closeSync(descriptor);
    }

    const ramRoot = mkdtempSync("/dev/shm/yf-command-root-");
    try {
      const ramFixture = join(ramRoot, "fixture.json");
      writeFileSync(ramFixture, "original");
      const ramProbe = spawnSync("python3", [
        guard,
        ramRoot,
        scratch,
        "--",
        "/usr/bin/python3",
        "-c",
        `
import pathlib,sys,errno
try:pathlib.Path(sys.argv[1]).write_text('MUTATED');raise RuntimeError('RAM_FIXTURE_WRITE_BYPASS')
except OSError as error:assert error.errno in (errno.EROFS,errno.EACCES,errno.EPERM),error
`,
        ramFixture,
      ], { encoding: "utf8", timeout: 20_000 });
      expect(ramProbe.status, ramProbe.stderr).toBe(0);
      expect(readFileSync(ramFixture, "utf8")).toBe("original");
    } finally {
      rmSync(ramRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("replay cache misses reject before a live fallback can run", () => {
  using space = workspace();
  const cache = new URL(
    "../node_modules/fetch-mock-cache/lib/runtimes/bun.js",
    import.meta.url,
  ).href;
  const store = new URL(
    "../node_modules/fetch-mock-cache/lib/stores/memory.js",
    import.meta.url,
  ).href;
  space.put(
    "src/missing.test.ts",
    `import {test,expect} from 'bun:test';
import createFetchCache from ${JSON.stringify(cache)};
import MemoryStore from ${JSON.stringify(store)};
test('replay miss',async()=>{
 let networkCalls=0;
 const cache=createFetchCache({Store:MemoryStore,fetch:()=>{networkCalls++;throw new Error('LIVE_FALLBACK');}});
 cache.once({id:'deliberately-missing'});
 await expect(cache('https://example.invalid/missing')).rejects.toThrow(/replay|cache|fixture/i);
 expect(networkCalls).toBe(0);console.log('REPLAY_MISS_DENIED');
});`,
  );
  const result = space.run([]);
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain("REPLAY_MISS_DENIED");
});

test("guard rejects missing Bubblewrap and overlapping scratch without fallback", () => {
  using space = workspace();
  const scratch = mkdtempSync(join(tmpdir(), "yf-guard-negative-"));
  try {
    for (
      const chosen of [
        space.root,
        join(space.root, "tests"),
        dirname(space.root),
      ]
    ) {
      mkdirSync(chosen, { recursive: true });
      const result = spawnSync("python3", [
        guard,
        space.root,
        chosen,
        "--",
        process.execPath,
        "-e",
        "console.log('UNGUARDED')",
      ], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain("UNGUARDED");
      expect(result.stderr).toContain("non-overlapping");
    }
    const noBwrap = spawnSync("/usr/bin/python3", [
      guard,
      space.root,
      scratch,
      "--",
      process.execPath,
      "-e",
      "console.log('UNGUARDED')",
    ], { encoding: "utf8", env: { ...process.env, PATH: "/nonexistent" } });
    expect(noBwrap.status).not.toBe(0);
    expect(noBwrap.stdout).not.toContain("UNGUARDED");
    expect(noBwrap.stderr).toContain("Bubblewrap");
    const missingLibrary = spawnSync("/usr/bin/python3", [
      "-c",
      `
import ctypes,runpy,sys
original=ctypes.CDLL
def load(name,*args,**kwargs):
 if name=='libseccomp.so.2':raise OSError('SYNTHETIC_MISSING_LIBSECCOMP')
 return original(name,*args,**kwargs)
ctypes.CDLL=load
sys.argv=${
        JSON.stringify([
          guard,
          space.root,
          scratch,
          "--",
          process.execPath,
          "-e",
          "console.log('UNGUARDED')",
        ])
      }
runpy.run_path(sys.argv[0],run_name='__main__')
`,
    ], { encoding: "utf8" });
    expect(missingLibrary.status).not.toBe(0);
    expect(missingLibrary.stderr).toContain("SYNTHETIC_MISSING_LIBSECCOMP");
    expect(missingLibrary.stdout).not.toContain("UNGUARDED");
    space.put("src/pass.test.ts", pass);
    const missingPython = space.run([], { PATH: "/nonexistent" });
    expect(missingPython.code).toBe(2);
    expect(missingPython.output).toContain("python3");
    expect(space.run([], { TMPDIR: space.root }).output).toContain(
      "TMPDIR must be outside",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("coverage stages regular output without granting writable fixture aliases", () => {
  using space = workspace();
  space.put("src/value.ts", "export const value = () => 7;");
  space.put(
    "src/pass.test.ts",
    "import {test,expect} from 'bun:test';import {value} from './value.ts';test('source coverage',()=>expect(value()).toBe(7));",
  );
  const result = space.run(["--coverage", "--serial"]);
  expect(result.code, result.output).toBe(0);
  expect(readFileSync(join(space.root, "coverage/lcov.info"), "utf8"))
    .toContain("TN:");
  for (const selection of [["--filter", "missing"], ["src/missing.test.ts"]]) {
    const empty = space.run(["--coverage", ...selection]);
    expect(empty.code, empty.output).toBe(2);
    expect(() => readFileSync(join(space.root, "coverage/lcov.info")))
      .toThrow();
    expect(space.run(["--coverage", "--serial"]).code).toBe(0);
  }
  const fixture = space.put(
    "tests/fixtures/http/original.json",
    '{"original":true}',
  );
  rmSync(join(space.root, "coverage/lcov.info"));
  linkSync(fixture, join(space.root, "coverage/lcov.info"));
  expect(space.run(["--coverage", "--serial"]).code).toBe(0);
  expect(readFileSync(fixture, "utf8")).toBe('{"original":true}');
  space.put("src/pass.test.ts", pass);
  expect(space.run(["--coverage", "--serial"]).code).toBe(0);
  expect(() => readFileSync(join(space.root, "coverage/lcov.info"))).toThrow();

  rmSync(join(space.root, "coverage"), { recursive: true });
  mkdirSync(join(space.root, "tests/fixtures/http"), { recursive: true });
  symlinkSync(
    join(space.root, "tests/fixtures/http"),
    join(space.root, "coverage"),
    "dir",
  );
  const rejected = space.run(["--coverage"]);
  expect(rejected.code).toBe(2);
  expect(rejected.output).toContain("coverage must be a real");
});

async function observedProcess(
  space: ReturnType<typeof workspace>,
  args: string[],
  onOutput: (output: string, child: ReturnType<typeof spawn>) => void,
) {
  const child = spawn(process.execPath, [space.driver, space.root, ...args], {
    cwd: tmpdir(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
  child.stdout?.on("data", (data) => {
    output += data;
    onOutput(output, child);
  });
  child.stderr?.on("data", (data) => {
    output += data;
    onOutput(output, child);
  });
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.on("error", reject);
    child.on("close", resolveExit);
  }).finally(() => clearTimeout(timer));
  return { code, output };
}

test("signals stop a running child and return the conventional signal status", async () => {
  using space = workspace();
  space.put(
    "src/wait.test.ts",
    "import{test}from'bun:test';import{spawn}from'node:child_process';test('wait',async()=>{spawn('python3',['-c','import time;time.sleep(30)'],{stdio:'inherit'});console.log('CHILD_READY');await new Promise(r=>setTimeout(r,30000));});",
  );
  let sent = false;
  const result = await observedProcess(
    space,
    ["--timeout", "40000"],
    (output, child) => {
      if (!sent && output.includes("CHILD_READY")) {
        sent = true;
        child.kill("SIGINT");
      }
    },
  );
  expect(sent).toBe(true);
  expect(result.code, result.output).toBe(130);
});

test("watch hard restarts and rediscovers test additions and removals", async () => {
  using space = workspace();
  const original = space.put("src/first.test.ts", pass);
  const vanished = space.put("src/vanished.json", "{}");
  expect(() =>
    fingerprint(space.root, (path) => {
      if (path === vanished) rmSync(path);
      return readFileSync(path);
    })
  ).not.toThrow();

  let phase = 0;
  const result = await observedProcess(
    space,
    ["--watch", "--serial"],
    (output, child) => {
      const waits =
        output.match(/Watch: waiting for source\/test content changes/g)
          ?.length ?? 0;
      if (phase === 0 && waits === 1) {
        phase++;
        space.put(
          "tests/added.test.ts",
          pass.replaceAll("selected leaf", "added leaf"),
        );
      } else if (phase === 1 && waits === 2) {
        phase++;
        rmSync(original);
      } else if (phase === 2 && waits === 3) {
        phase++;
        child.kill("SIGTERM");
      }
    },
  );
  expect(phase, result.output).toBe(3);
  expect(result.code, result.output).toBe(143);
  expect(result.output).toContain("Replay: 2 files");
  expect(result.output.match(/Replay: 1 files/g)).toHaveLength(2);
});

test("watch reruns after config, executable and root policy changes", async () => {
  using space = workspace();
  space.put("src/one.ts", "export const value = 'one';");
  space.put("src/two.ts", "export const value = 'two';");
  space.put("bin/helper.ts", "export const value = 'bin-one';");
  space.put("runtime-policy.mjs", "export const value = 'policy-one';");
  space.put(
    "src/alias.test.ts",
    "import {test} from 'bun:test';import {value} from 'selected';import {value as bin} from '../bin/helper.ts';import {value as policy} from '../runtime-policy.mjs';test('alias',()=>console.log('ALIAS_VALUE_'+value+' BIN_VALUE_'+bin+' ROOT_VALUE_'+policy));",
  );
  space.put(
    "tsconfig.json",
    JSON.stringify({ extends: "./tsconfig.paths.json" }),
  );
  const config = (value: string) =>
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { selected: [`./src/${value}.ts`] },
      },
    });
  space.put("tsconfig.paths.json", config("one"));
  for (const name of ["tsconfig.migration.json", "deno.json", "bunfig.toml"]) {
    const before = fingerprint(space.root);
    space.put(name, name.endsWith(".toml") ? "# runtime configuration" : "{}");
    expect(fingerprint(space.root), name).not.toBe(before);
  }

  let phase = 0;
  const result = await observedProcess(
    space,
    ["--watch", "--serial"],
    (output, child) => {
      const waits =
        output.match(/Watch: waiting for source\/test content changes/g)
          ?.length ?? 0;
      if (phase === 0 && waits === 1) {
        phase++;
        space.put("tsconfig.paths.json", config("two"));
      } else if (phase === 1 && waits === 2) {
        phase++;
        space.put("bin/helper.ts", "export const value = 'bin-two';");
      } else if (phase === 2 && waits === 3) {
        phase++;
        space.put("runtime-policy.mjs", "export const value = 'policy-two';");
      } else if (phase === 3 && waits === 4) {
        phase++;
        child.kill("SIGTERM");
      }
    },
  );
  expect(phase, result.output).toBe(4);
  expect(result.code, result.output).toBe(143);
  expect(result.output).toContain("ALIAS_VALUE_one");
  expect(result.output).toContain("ALIAS_VALUE_two");
  expect(result.output).toContain("BIN_VALUE_bin-one");
  expect(result.output).toContain("BIN_VALUE_bin-two");
  expect(result.output).toContain("ROOT_VALUE_policy-one");
  expect(result.output).toContain("ROOT_VALUE_policy-two");
});
