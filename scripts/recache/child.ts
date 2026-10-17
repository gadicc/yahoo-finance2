import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { captureEndpoint, captureHosts, type CaptureBroker } from "./broker.ts";
import type { CaptureSession } from "./session.ts";
import { captureEnvironment } from "./environment.ts";
import { readFixtureBytes } from "../recache-fixtures.ts";
import {
  parseRecacheStats,
  type RecacheEndpointStats,
} from "../../tests/recacheStats.ts";

const guard = fileURLToPath(new URL("../testing/offline.py", import.meta.url));
const preload = fileURLToPath(new URL("./preload.ts", import.meta.url));

export interface CaptureChildResult {
  code: number;
  stats: RecacheEndpointStats[];
  rateLimited: boolean;
  trace?: unknown;
}

/** No test output crosses this boundary except validated counters and geo trace. */
export async function runCaptureChild(
  root: string,
  scratch: string,
  file: string,
  session: CaptureSession,
  broker: CaptureBroker,
  abort: AbortSignal,
  runTimeout = 3600000,
): Promise<CaptureChildResult> {
  const identity = randomUUID();
  const configPath = join(scratch, `session-${identity}.json`);
  const report = join(scratch, `capture-${identity}.xml`);
  await writeFile(
    configPath,
    JSON.stringify({ ...session, socket: broker.socket, token: broker.token }),
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  const environment = captureEnvironment(scratch);
  environment.YF_CAPTURE_SESSION = configPath;
  const child = spawn(
    "python3",
    [
      guard,
      "--profile",
      "ipc",
      root,
      scratch,
      "--",
      process.execPath,
      "test",
      "--no-env-file",
      "--no-orphans",
      "--isolate",
      `--timeout=${runTimeout}`,
      `--preload=${preload}`,
      "--reporter=junit",
      `--reporter-outfile=${report}`,
      file,
    ],
    {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  let stats: RecacheEndpointStats[] = [];
  let trace: unknown;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    killTimer ??= setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }, 500);
  };
  async function consume(source: AsyncIterable<Buffer>) {
    let unfinished = "";
    for await (const chunk of source) {
      const text = chunk.toString("utf8");
      const lines = (unfinished + text).split(/\r?\n/);
      unfinished = lines.pop()!.slice(-65536);
      for (const line of lines) {
        const snapshot = parseRecacheStats(line);
        if (snapshot)
          stats = snapshot.flatMap((row) => {
            try {
              const url = new URL("https://" + row.endpoint);
              if (
                !captureHosts.has(url.hostname) ||
                url.search ||
                url.hash ||
                url.username ||
                url.password ||
                url.port
              )
                return [];
              return [{ ...row, endpoint: captureEndpoint(url) }];
            } catch {
              return [];
            }
          });
        if (line.startsWith("GET_CRUMB_TRACE=")) {
          try {
            trace = JSON.parse(line.slice("GET_CRUMB_TRACE=".length));
          } catch {
            /* invalid trace is rejected later */
          }
        }
      }
    }
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, runTimeout);
  // The broker is authoritative even if test code hides its console or calls
  // the preload facade directly instead of the recache wrapper.
  let observedLimit: number | undefined;
  const limitTimer = setInterval(() => {
    if (!broker.rateLimited) return;
    observedLimit ??= Date.now();
    // The broker refuses every later network request immediately. Give the
    // existing wrapper up to 100ms to report its counters before forced exit.
    if (Date.now() - observedLimit >= 100) stop();
  }, 20);
  abort.addEventListener("abort", stop, { once: true });
  if (abort.aborted) stop();
  try {
    const [code] = await Promise.all([
      new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code ?? 1));
      }),
      consume(child.stdout!),
      consume(child.stderr!),
    ]);
    const rateLimited = broker.rateLimited;
    if (timedOut) return { code: 124, stats, rateLimited, trace };
    if (abort.aborted || rateLimited)
      return { code: 1, stats, rateLimited, trace };
    // Successful native exit with zero registered leaves is not a completed run.
    const xml = await readFixtureBytes(report, true).then(
      (bytes) => bytes.toString("utf8"),
      () => "",
    );
    const cases = [
      ...xml.matchAll(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g),
    ];
    if (!cases.some((match) => !/<skipped\b/.test(match[0]))) {
      return { code: 1, stats, rateLimited, trace };
    }
    return { code, stats, rateLimited, trace };
  } finally {
    clearTimeout(timer);
    clearInterval(limitTimer);
    if (killTimer) clearTimeout(killTimer);
    abort.removeEventListener("abort", stop);
    await rm(configPath, { force: true });
    await rm(report, { force: true });
  }
}
