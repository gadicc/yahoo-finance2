/** Actual native process/stdio controls; no simulated Windows branch. */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { waitNativeChild, windowsTreeCommand } from "./testing/native.ts";

const results = resolve(process.argv[2]);
const root = mkdtempSync(join(results, "actual-process-"));
const metadata: Record<string, unknown> = {
  platform: process.platform,
  bun: process.versions.bun,
};
function forceTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const [exe, args] = windowsTreeCommand(
      child.pid,
      process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "",
    );
    spawnSync(exe, args, { timeout: 5000, stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
function forcePID(pid: number) {
  if (process.platform === "win32") {
    const [exe, args] = windowsTreeCommand(
      pid,
      process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "",
    );
    const killed = spawnSync(exe, args, { timeout: 5000, encoding: "utf8" });
    assert.ifError(killed.error);
    // A race with natural exit is harmless only if the PID no longer exists.
    if (killed.status !== 0) assert.throws(() => process.kill(pid, 0));
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
async function until(check: () => boolean, message: string) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
// Real direct child cancellation. Windows taskkill is forced termination; its
// raw child status is recorded, not misrepresented as POSIX SIGTERM delivery.
const live = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
  cwd: root,
  detached: process.platform !== "win32",
  stdio: "ignore",
});
const controller = new AbortController();
const timer = setTimeout(() => controller.abort("SIGTERM"), 200);
const started = Date.now();
try {
  const ended = await waitNativeChild(live, controller.signal, 10000);
  assert(Date.now() - started < 7500);
  assert(live.exitCode !== null || live.signalCode !== null);
  metadata.cancellation = {
    ...ended,
    elapsedMs: Date.now() - started,
    exitCode: live.exitCode,
    signalCode: live.signalCode,
    mechanism:
      process.platform === "win32"
        ? "actual taskkill /PID /T /F; no console Ctrl-C claim"
        : "actual POSIX group SIGTERM",
  };
} finally {
  clearTimeout(timer);
  forceTree(live);
}

const pidFile = join(root, "descendant-pid");
const stdioRuntime = process.env.YF_NODE24 ?? process.execPath;
metadata.heldStdioParentRuntime = stdioRuntime;
const parent = spawn(
  stdioRuntime,
  [
    "-e",
    `
const {spawn}=require('node:child_process');
const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore',1,2]});
require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(descendant.pid));
console.log('INHERITED_STDIO_READY');setTimeout(()=>process.exit(0),100);
`,
  ],
  {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
parent.stdout.on("data", (chunk) => {
  output += chunk;
});
parent.stderr.on("data", (chunk) => {
  output += chunk;
});
let descendant: number | undefined;
let closed = false;
parent.once("close", () => {
  closed = true;
});
const emergency = setTimeout(() => {
  if (descendant) forcePID(descendant);
  forceTree(parent);
}, 9000);
try {
  await until(
    () => existsSync(pidFile) && parent.exitCode !== null,
    `Held-stdio parent did not become ready: ${output}`,
  );
  descendant = Number(readFileSync(pidFile, "utf8"));
  assert(Number.isSafeInteger(descendant) && descendant > 0);
  assert(
    !closed,
    "Control requires a real exited parent whose descendant holds stdio",
  );
  const began = Date.now();
  let failure: string | undefined;
  let ended: { code: number; timeout: boolean } | undefined;
  try {
    ended = await waitNativeChild(parent, new AbortController().signal, 200);
  } catch (error) {
    failure = String(error);
  }
  assert(Date.now() - began < 7500, "Held-stdio completion was not bounded");
  if (process.platform === "win32") {
    assert(
      failure?.includes("descendant cleanup is unverified"),
      "Exited Windows parent must report cleanup uncertainty",
    );
  } else {
    assert.equal(failure, undefined);
    assert(ended?.timeout);
  }
  metadata.exitedParentHeldStdio = {
    realInheritedPipe: true,
    elapsedMs: Date.now() - began,
    failure,
    ended,
    cleanup:
      process.platform === "win32"
        ? "Expected visible bounded operational failure; known descendant is explicitly cleaned by this probe"
        : "Actual POSIX group cleanup closes inherited stdio",
  };
} finally {
  clearTimeout(emergency);
  if (descendant) forcePID(descendant);
  forceTree(parent);
  parent.stdout.destroy();
  parent.stderr.destroy();
  parent.unref();
}
writeFileSync(
  join(results, "actual-process-metadata.json"),
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(JSON.stringify(metadata));
