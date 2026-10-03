import { walk } from "@std/fs/walk";
import { hasRateLimitLog } from "./check-recache-rate-limits.ts";
import {
  formatRecacheStats,
  mergeRecacheStats,
  parseRecacheStats,
  type RecacheEndpointStats,
} from "../tests/recacheStats.ts";

/** Read test output, retaining only enough text to detect a split log message. */
async function forward(
  source: ReadableStream<Uint8Array>,
  destination: { write(data: Uint8Array): Promise<number> },
  onRateLimit: () => void,
  onStats: (stats: RecacheEndpointStats[]) => void,
) {
  const decoder = new TextDecoder();
  let recent = "";
  let unfinishedLine = "";
  for await (const chunk of source) {
    let written = 0;
    while (written < chunk.length) {
      written += await destination.write(chunk.subarray(written));
    }
    const decoded = decoder.decode(chunk, { stream: true });
    const lines = (unfinishedLine + decoded).split(/\r?\n/);
    unfinishedLine = lines.pop()!;
    for (const line of lines) {
      const stats = parseRecacheStats(line);
      if (stats) onStats(stats);
    }
    const output = recent + decoded;
    if (hasRateLimitLog(output)) onRateLimit();
    recent = output.slice(-4096);
  }
}

if (import.meta.main) {
  if (Deno.env.get("FETCH_DEVEL") !== "recache") {
    throw new Error("Run with FETCH_DEVEL=recache");
  }
  const interval = Number(Deno.env.get("FETCH_DEVEL_RECACHE_INTERVAL") ?? 3000);
  if (!Number.isFinite(interval) || interval < 0) {
    throw new Error(
      "FETCH_DEVEL_RECACHE_INTERVAL must be a nonnegative finite number",
    );
  }

  const files = Deno.args.length ? [...Deno.args] : [];
  if (!files.length) {
    for (const root of ["scripts", "src", "tests"]) {
      for await (
        const entry of walk(root, {
          includeDirs: false,
          skip: [/^tests\/cloudflare(?:\/|$)/],
          match: [/(?:[._](?:test|spec))\.(?:[cm]?[jt]s|[jt]sx)$/],
        })
      ) files.push(entry.path);
    }
    files.sort();
  }

  let failed = false;
  let rateLimited = false;
  const snapshots = new Map<string, RecacheEndpointStats[]>();
  for (const [index, file] of files.entries()) {
    // Each test file has its own runtime. Keep spacing across file boundaries,
    // as well as the network fetch wrapper's shared spacing within each file.
    if (index > 0 && interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    const child = new Deno.Command(Deno.execPath(), {
      args: ["test", "--no-prompt", "-P=test", file],
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    let stopped = false;
    const stop = () => {
      rateLimited = true;
      if (stopped) return;
      stopped = true;
      try {
        // Deno's test runner defers SIGTERM until the running test finishes.
        // No further network or fixture work should continue after a 429.
        child.kill("SIGKILL");
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    };
    await Promise.all([
      forward(
        child.stdout,
        Deno.stdout,
        stop,
        (stats) => snapshots.set(file, stats),
      ),
      forward(
        child.stderr,
        Deno.stderr,
        stop,
        (stats) => snapshots.set(file, stats),
      ),
    ]);
    const status = await child.status;
    failed ||= !status.success;
    if (rateLimited) break;
  }
  console.log(formatRecacheStats(mergeRecacheStats(snapshots.values())));
  Deno.exit(failed || rateLimited ? 1 : 0);
}
