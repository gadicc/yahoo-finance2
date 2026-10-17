import type { ChildProcess } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { constants } from "node:os";

/** Native replay is a trusted development policy, not an OS sandbox. */
export function nativeEnvironment(
  environment: NodeJS.ProcessEnv,
  scratch: string,
): NodeJS.ProcessEnv {
  const result = { ...environment };
  const inheritedPath = Object.entries(environment).find(
    ([key]) => key.toUpperCase() === "PATH",
  )?.[1];
  for (const key of Object.keys(result)) {
    const upper = key.toUpperCase();
    if (
      upper.startsWith("FETCH_DEVEL") ||
      upper.startsWith("FMC_") ||
      ["NODE_OPTIONS", "BUN_OPTIONS", "TMPDIR", "TMP", "TEMP", "PATH"].includes(
        upper,
      )
    )
      delete result[key];
  }
  return {
    ...result,
    ...(inheritedPath === undefined
      ? {}
      : { PATH: environment.PATH ?? inheritedPath }),
    FETCH_DEVEL: "",
    FMC_CACHE_MODE: "replay",
    TMPDIR: scratch,
    TMP: scratch,
    TEMP: scratch,
  };
}

export function isNativeReplay(): boolean {
  return (
    (globalThis as Record<symbol, unknown>)[
      Symbol.for("yahoo-finance2.native-replay")
    ] === true
  );
}

/** Paths, directories and bytes: notices additions/removals, including empty dirs. */
export function fixtureSnapshot(root: string): string {
  const hash = createHash("sha256");
  function visit(path: string, name: string) {
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hash.update(`missing\0${name}\0`);
      return;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Native replay fixture symlinks are unsupported: ${name}`,
      );
    }
    if (stat.isDirectory()) {
      hash.update(`directory\0${name}\0`);
      for (const entry of readdirSync(path).sort()) {
        visit(join(path, entry), `${name}/${entry}`);
      }
    } else if (stat.isFile()) {
      hash.update(`file\0${name}\0`);
      hash.update(createHash("sha256").update(readFileSync(path)).digest());
    } else throw new Error(`Unsupported native fixture entry: ${name}`);
  }
  for (const path of ["fixtures", "http"]) {
    visit(join(root, "tests", path), `tests/${path}`);
  }
  return hash.digest("hex");
}

export function assertFixtureSnapshot(root: string, before: string): void {
  if (fixtureSnapshot(root) !== before) {
    throw new Error(
      "Native replay detected fixture changes; inspect and restore them before continuing",
    );
  }
}

/** No shell, PATH lookup or negative PID on Windows. */
export function windowsTreeCommand(
  pid: number,
  systemRoot: string,
): [string, string[]] {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("Invalid child PID");
  if (!win32.isAbsolute(systemRoot))
    throw new Error("Invalid Windows SystemRoot");
  const executable = win32.join(systemRoot, "System32", "taskkill.exe");
  return [executable, ["/PID", String(pid), "/T", "/F"]];
}

export function terminateNativeWindows(
  child: ChildProcess,
  execute: (
    command: string,
    args: string[],
  ) => { status: number | null; error?: Error } = (command, args) =>
    spawnSync(command, args, {
      windowsHide: true,
      stdio: "ignore",
      timeout: 5000,
    }),
): void {
  if (!child.pid) return;
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(
      "Native Windows runner exited before tree cleanup; descendant cleanup is unverified",
    );
  }
  const [command, args] = windowsTreeCommand(
    child.pid,
    process.env.SystemRoot ?? process.env.WINDIR ?? "C:/Windows",
  );
  const result = execute(command, args);
  if (result.error || result.status !== 0) {
    child.kill("SIGKILL"); // Best effort only; the launcher still fails visibly.
    throw new Error(
      `Native Windows process-tree cleanup failed (${result.error?.message ?? result.status})`,
    );
  }
}

export function signalNativeGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

interface NativeWaitControls {
  platform?: NodeJS.Platform;
  closeTimeout?: number;
  terminateWindows?: (child: ChildProcess) => void;
  signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
}

/** A failed native cleanup must settle visibly even if close never arrives. */
export async function waitNativeChild(
  child: ChildProcess,
  abort: AbortSignal,
  runTimeout: number,
  controls: NativeWaitControls = {},
): Promise<{ code: number; timeout: boolean }> {
  const platform = controls.platform ?? process.platform;
  const windows = controls.terminateWindows ?? terminateNativeWindows;
  const group = controls.signalGroup ?? signalNativeGroup;
  let timeout = false;
  let cleanupError: unknown;
  let terminating = false;
  let closing: ReturnType<typeof setTimeout> | undefined;
  let settle: (code: number) => void = () => {};
  const terminate = () => {
    // The supervisor abort and local deadline can arrive together. Attempt tree
    // cleanup once: a second taskkill could report an already-exited PID.
    if (terminating) return;
    terminating = true;
    closing ??= setTimeout(() => {
      cleanupError ??= new Error(
        "Native process did not close after cancellation; descendant cleanup is unverified",
      );
      child.unref();
      settle(2);
    }, controls.closeTimeout ?? 1500);
    try {
      if (platform === "win32") windows(child);
      else if (child.pid) group(child.pid, "SIGTERM");
    } catch (error) {
      cleanupError ??= error;
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
  };
  const timer = setTimeout(() => {
    timeout = true;
    terminate();
  }, runTimeout);
  try {
    const code = await new Promise<number>((resolve, reject) => {
      settle = resolve;
      child.once("error", reject);
      child.once("close", (code, signal) =>
        resolve(
          code ??
            (signal === "SIGINT"
              ? 130
              : signal === "SIGTERM"
                ? 143
                : signal
                  ? 128 + (constants.signals[signal] ?? 1)
                  : 1),
        ),
      );
      abort.addEventListener("abort", terminate, { once: true });
      if (abort.aborted) terminate();
    });
    if (cleanupError) throw cleanupError;
    return { code, timeout };
  } finally {
    clearTimeout(timer);
    if (closing) clearTimeout(closing);
    abort.removeEventListener("abort", terminate);
    // POSIX group cleanup also covers a parent that closed before a descendant.
    // Windows relies on Bun's --no-orphans normally and taskkill while PID exists;
    // an exited-parent failure is bounded/reported, never called a tree guarantee.
    if (platform !== "win32" && child.pid) group(child.pid, "SIGKILL");
  }
}
