import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { inventory, select } from "../testing/inventory.ts";
import { fixtureChanges, snapshotFixtures } from "../recache-fixtures.ts";
import { createCaptureBroker, type CaptureTransport } from "./broker.ts";
import { captureEnvironment } from "./environment.ts";
import { runCaptureChild } from "./child.ts";
import { publishStage, stageFixtures } from "./staging.ts";
import {
  formatRecacheStats,
  mergeRecacheStats,
  type RecacheEndpointStats,
} from "../../tests/recacheStats.ts";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const baselineEntry = fileURLToPath(new URL("./baseline.ts", import.meta.url));

export interface RecacheOptions {
  paths: string[];
  live: boolean;
  help: boolean;
  interval: number;
  runTimeout: number;
  baselineTimeout: number;
}

export function parseRecacheArguments(
  args: string[],
  interval = "3000",
): RecacheOptions {
  const options: RecacheOptions = {
    paths: [],
    live: false,
    help: false,
    interval: Number(interval),
    runTimeout: 3600000,
    baselineTimeout: 300000,
  };
  let commonTimeout: number | undefined;
  let baselineTimeout: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--live") options.live = true;
    else if (flag === "--help") options.help = true;
    else if (flag === "--run-timeout" || flag === "--baseline-timeout") {
      const timeout = Number(args[++index]);
      if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 2147483647) {
        throw new Error(`${flag} must be a positive bounded integer`);
      }
      if (flag === "--run-timeout") commonTimeout = timeout;
      else baselineTimeout = timeout;
    } else if (flag.startsWith("-")) throw new Error("Unknown recache option");
    else options.paths.push(flag);
  }
  if (
    !Number.isFinite(options.interval) ||
    options.interval < 0 ||
    options.interval > 2147483647
  ) {
    throw new Error(
      "FETCH_DEVEL_RECACHE_INTERVAL must be a bounded nonnegative number",
    );
  }
  options.runTimeout = commonTimeout ?? options.runTimeout;
  options.baselineTimeout =
    baselineTimeout ?? commonTimeout ?? options.baselineTimeout;
  return options;
}

export async function replayBaseline(
  root: string,
  files: string[],
  signal: AbortSignal,
  timeout: number,
): Promise<boolean> {
  const environment = captureEnvironment(await realpath(tmpdir()));
  const child = spawn(
    process.execPath,
    ["--no-env-file", baselineEntry, root, String(timeout), ...files],
    {
      cwd: root,
      env: environment,
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    },
  );
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
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
  const timer = setTimeout(stop, timeout);
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code === 0 && !stopped));
    });
  } finally {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    signal.removeEventListener("abort", stop);
  }
}

/** Internal dependencies permit synthetic offline roots/transports, not CLI bypasses. */
export interface RecacheDependencies {
  root?: string;
  transport?: CaptureTransport;
  signal?: AbortSignal;
  log?: (message: string) => void;
}

/** Maintained library tier; tooling integrations are never capture targets. */
export function recacheInventory(root: string): string[] {
  return inventory(root).filter(
    (file) => file.startsWith("src/") || /^tests\/[^/]+\.test\.ts$/.test(file),
  );
}

export function selectRecacheFiles(root: string, paths: string[]): string[] {
  const available = recacheInventory(root);
  // Resolve against the complete inventory first so explicit tooling selections
  // fail with an actionable reason rather than silently dropping those files.
  const selected = paths.length ? select(root, inventory(root), paths) : [];
  if (selected.some((file) => !available.includes(file))) {
    throw new Error(
      "Recache accepts only src/**/*.test.ts and tests/*.test.ts; tooling and integration paths are unsupported",
    );
  }
  return select(root, available, paths);
}

export async function runRecache(
  options: RecacheOptions,
  dependencies: RecacheDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console.log;
  if (options.help) {
    log(
      "Usage: FETCH_DEVEL=recache bun scripts/recache-tests.ts --live [--run-timeout MS] [--baseline-timeout MS] [TEST PATH ...]",
    );
    return 0;
  }
  if (!options.live) {
    log("Recache requires explicit --live opt-in");
    return 2;
  }
  const signal = dependencies.signal ?? new AbortController().signal;
  const root = await realpath(dependencies.root ?? repository);
  let files: string[];
  try {
    files = selectRecacheFiles(root, options.paths);
  } catch {
    log(
      "Recache selection failed: select maintained src/**/*.test.ts or tests/*.test.ts files; tooling, integration, missing and empty selections are unsupported",
    );
    return 2;
  }
  log("### Yahoo recache replay-only baseline");
  if (!(await replayBaseline(root, files, signal, options.baselineTimeout))) {
    log(
      "Recache ABORTED: replay-only baseline failed; live recaching did not start. Exit status: 1.",
    );
    return 1;
  }
  log("Replay-only baseline passed; starting explicitly requested captures.");
  const temporary = await realpath(tmpdir());
  if (temporary === root || temporary.startsWith(root + sep)) {
    throw new Error("Capture TMPDIR must be outside the repository");
  }
  const scratch = await mkdtemp(join(temporary, "yf-recache-"));
  try {
    if (root.startsWith(scratch + sep) || scratch.startsWith(root + sep))
      throw new Error("Capture scratch overlaps repository");
    const fixtureRoot = join(root, "tests", "fixtures", "http");
    const before = await snapshotFixtures(fixtureRoot);
    const stage = await stageFixtures(fixtureRoot, scratch);
    const broker = await createCaptureBroker(
      join(scratch, "broker.sock"),
      dependencies.transport,
      undefined,
      options.interval,
    );
    let failed = false;
    const snapshots = new Map<string, RecacheEndpointStats[]>();
    let limitedFile: string | undefined;
    let previousBrokerStats: RecacheEndpointStats[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (signal.aborted) return 1;
        if (index && options.interval)
          await sleep(options.interval, undefined, { signal });
        log(`### Recaching file ${index + 1}/${files.length}`);
        const result = await runCaptureChild(
          root,
          scratch,
          resolve(root, file),
          {
            fixtureRoot: stage.fixtureRoot,
            mode: "recache",
            interval: options.interval,
          },
          broker,
          signal,
          options.runTimeout,
        );
        const currentBrokerStats = broker.getStats();
        const rows = new Map(result.stats.map((row) => [row.endpoint, row]));
        for (const row of currentBrokerStats) {
          const previous = previousBrokerStats.find(
            (item) => item.endpoint === row.endpoint,
          );
          const requests = row.requests - (previous?.requests ?? 0);
          if (!requests) continue;
          const existing = rows.get(row.endpoint);
          const statuses: Record<string, number> = {};
          for (const [status, total] of Object.entries(row.statuses)) {
            const count = total - (previous?.statuses[status] ?? 0);
            if (count) statuses[status] = count;
          }
          rows.set(row.endpoint, {
            endpoint: row.endpoint,
            requests,
            reused: existing?.reused ?? 0,
            statuses,
          });
        }
        previousBrokerStats = currentBrokerStats;
        snapshots.set(file, [...rows.values()]);
        failed ||= result.code !== 0;
        const published = await publishStage(stage);
        failed ||= published.rejected.length > 0;
        log(
          `Validated captures published: ${published.published}; rejected: ${published.rejected.length}.`,
        );
        if (result.rateLimited || broker.rateLimited) {
          limitedFile = file;
          failed = true;
          break;
        }
      }
      log(formatRecacheStats(mergeRecacheStats(snapshots.values())));
      if (limitedFile)
        log(
          "Recache ABORTED: HTTP 429; no further test files started. Exit status: 1.",
        );
      const changes = fixtureChanges(
        before,
        await snapshotFixtures(fixtureRoot),
      );
      log(`Fixture changes since this run started: ${changes.length}.`);
      log(
        "Earlier validated captures remain on disk for review; no rollback, staging, commit, or push was performed.",
      );
      return failed ? 1 : 0;
    } finally {
      await broker.close();
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
