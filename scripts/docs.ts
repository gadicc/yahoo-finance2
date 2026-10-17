import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  outputTransaction,
  validateOutput,
  markerName,
} from "./docs/output.ts";

import { inputSnapshot } from "./docs/inputs.ts";

export const repository = realpathSync(
  fileURLToPath(new URL("../", import.meta.url)),
);
export function parseArgs(args: string[], root = repository) {
  const command = args.shift();
  if (!command || !["gen", "lint", "watch", "open"].includes(command)) {
    throw new Error(
      "Usage: bun scripts/docs.ts gen|lint|watch|open [--out-dir PATH]",
    );
  }
  let output = join(root, "jsdocs");
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--out-dir" || !args[1])
      throw new Error("Expected --out-dir PATH");
    output = resolve(args[1]);
  }
  return { command, output };
}

export function openerArgs(platform: NodeJS.Platform, index: string): string[] {
  const url = pathToFileURL(index).href;
  if (platform === "linux") return ["xdg-open", url];
  if (platform === "darwin") return ["open", url];
  if (platform === "win32")
    return ["rundll32.exe", "url.dll,FileProtocolHandler", url];
  throw new Error(
    `No documentation opener for ${platform}; open ${url} manually`,
  );
}

/** The opener is the only explicit GUI boundary; tests inject a headless spawn. */
export async function openDocs(
  output: string,
  root: string,
  launch = spawn,
  platform = process.platform,
) {
  validateOutput(output, root);
  // Empty directories are valid generation targets, but cannot be opened.
  readFileSync(join(output, markerName));
  readFileSync(join(output, "documentation-report.json"));
  readFileSync(join(output, "index.html"));
  const [command, ...args] = openerArgs(platform, join(output, "index.html"));
  if (!command) throw new Error("Missing opener command");
  const child = launch(command, args, { stdio: "ignore", shell: false });
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await new Promise<void>((accept, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        code === 0
          ? accept()
          : reject(new Error(`Documentation opener exited ${code ?? signal}`)),
      );
    });
  } finally {
    clearTimeout(timer);
  }
}

export function inputDigest(root: string): string {
  return inputSnapshot(root).fingerprint;
}

/** A fresh worker per build isolates the pinned plugin's one-time Context patch. */
export async function buildDocs(
  root: string,
  output: string,
  lint: boolean,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error("Documentation build interrupted");
  const temporary = lint
    ? mkdtempSync(join(tmpdir(), "yf-docs-lint-"))
    : undefined;
  const transaction = lint ? undefined : outputTransaction(output, root);
  const staging = temporary ?? transaction?.staging;
  if (!staging) throw new Error("Missing documentation staging directory");
  let child: ChildProcess | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    child?.kill("SIGTERM");
    killTimer = setTimeout(() => child?.kill("SIGKILL"), 2000);
  };
  try {
    const digest = inputDigest(root);
    const worker = spawn(
      process.execPath,
      [join(root, "scripts/docs/worker.ts"), root, staging, digest],
      {
        cwd: root,
        stdio: "inherit",
        shell: false,
      },
    );
    child = worker;
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    await new Promise<void>((accept, reject) => {
      worker.once("error", reject);
      worker.once("exit", (code, termination) =>
        code === 0 && !signal?.aborted
          ? accept()
          : reject(
              new Error(`Documentation worker exited ${code ?? termination}`),
            ),
      );
    });
    if (inputDigest(root) !== digest)
      throw new Error(
        "Documentation inputs changed during generation; retrying requires a fresh build",
      );
    transaction?.publish();
  } finally {
    signal?.removeEventListener("abort", stop);
    if (killTimer) clearTimeout(killTimer);
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    transaction?.close();
  }
}

export async function watchDocs(
  root: string,
  output: string,
  signal: AbortSignal,
) {
  let previous = "";
  let previousError = "";
  while (!signal.aborted) {
    let fingerprintRead = false;
    try {
      const digest = inputDigest(root);
      fingerprintRead = true;
      if (digest !== previous) {
        previous = digest;
        await buildDocs(root, output, false, signal);
      }
      previousError = "";
    } catch (error) {
      // Restoring an unreadable input must retry even when its bytes are unchanged.
      if (!fingerprintRead) previous = "";
      const message = error instanceof Error ? error.message : String(error);
      if (!signal.aborted && message !== previousError) {
        console.error(`[docs:watch] ${message}`);
      }
      previousError = message;
    }
    if (signal.aborted) break;
    await new Promise<void>((accept) => {
      const stop = () => {
        clearTimeout(timer);
        accept();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", stop);
        accept();
      }, 300);
      signal.addEventListener("abort", stop, { once: true });
    });
  }
}

async function main() {
  const { command, output } = parseArgs(process.argv.slice(2));
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (command === "open") await openDocs(output, repository);
    else if (command === "watch")
      await watchDocs(repository, output, abort.signal);
    else await buildDocs(repository, output, command === "lint", abort.signal);
  } catch (error) {
    if (!abort.signal.aborted) throw error;
  } finally {
    if (abort.signal.aborted) process.exitCode = 130;
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
