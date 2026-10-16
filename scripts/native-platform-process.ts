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
const readyFile = join(root, "descendant-ready");
const releaseFile = join(root, "release-parent");
const stdioRuntime = process.env.YF_NODE24 ?? process.execPath;
metadata.heldStdioParentRuntime = stdioRuntime;
const parent = spawn(
  stdioRuntime,
  [
    "-e",
    `
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const descendant=spawn(process.execPath,['-e',${JSON.stringify(`
const fs=require('node:fs');
setInterval(()=>{},1000);
fs.writeSync(1,'INHERITED_STDOUT_READY\\n');
fs.writeSync(2,'INHERITED_STDERR_READY\\n');
fs.writeFileSync(${JSON.stringify(readyFile)},'ready');
`)}],{
  stdio:['ignore',1,2],
  // Node/libuv kills non-detached Windows children when their parent exits.
  // POSIX keeps the descendant in its parent's group for real group cleanup.
  detached:process.platform==='win32',
  windowsHide:true,
});
fs.writeFileSync(${JSON.stringify(pidFile)},String(descendant.pid));
setInterval(()=>{
  if(fs.existsSync(${JSON.stringify(readyFile)})&&fs.existsSync(${JSON.stringify(releaseFile)}))process.exit(0);
},10);
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
}, 15000);
try {
  await until(
    () => existsSync(pidFile),
    `Held-stdio parent did not publish its descendant PID: ${output}`,
  );
  descendant = Number(readFileSync(pidFile, "utf8"));
  assert(Number.isSafeInteger(descendant) && descendant > 0);
  await until(
    () =>
      existsSync(readyFile) &&
      output.includes("INHERITED_STDOUT_READY") &&
      output.includes("INHERITED_STDERR_READY"),
    `Descendant did not prove both inherited pipes: ${output}`,
  );
  assert.equal(parent.exitCode, null, "Parent exited before observer release");
  writeFileSync(releaseFile, "release");
  await until(
    () => parent.exitCode !== null,
    `Held-stdio parent did not exit after observer release: ${output}`,
  );
  process.kill(descendant, 0); // Post-exit liveness, independent of the handshake.
  assert(
    !closed,
    "Control requires a real exited parent whose live descendant holds stdio",
  );
  metadata.heldStdioSetup = {
    descendant,
    detachedDescendant: process.platform === "win32",
    inheritedStdoutHandshake: true,
    inheritedStderrHandshake: true,
    parentExitCode: parent.exitCode,
    descendantAliveAfterParentExit: true,
    stdioStillOpenAfterParentExit: true,
  };
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
  try {
    // Recovery can itself fail; parent-tree teardown must still run.
    if (descendant === undefined && existsSync(pidFile)) {
      const known = Number(readFileSync(pidFile, "utf8"));
      if (Number.isSafeInteger(known) && known > 0) descendant = known;
    }
    if (descendant) {
      const knownPID = descendant;
      forcePID(knownPID);
      await until(() => {
        try {
          process.kill(knownPID, 0);
          return false;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          return true;
        }
      }, "Known descendant remained live after explicit probe cleanup");
      metadata.knownDescendantCleanupVerified = true;
    }
  } finally {
    try {
      forceTree(parent);
      metadata.heldStdioObservation = {
        descendant,
        parentExitCode: parent.exitCode,
        parentSignalCode: parent.signalCode,
        closeObserved: closed,
        output,
      };
      writeFileSync(
        join(results, "actual-process-metadata.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
    } finally {
      // Metadata and individual stream failures cannot bypass the other handles.
      try {
        parent.stdout.destroy();
      } finally {
        try {
          parent.stderr.destroy();
        } finally {
          parent.unref();
        }
      }
    }
  }
}
console.log(JSON.stringify(metadata));
