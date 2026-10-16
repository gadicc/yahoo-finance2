import { constants } from "node:os";
import {
  parseRecacheArguments,
  type RecacheDependencies,
  runRecache,
} from "./recache/orchestrator.ts";
export { parseRecacheArguments, runRecache } from "./recache/orchestrator.ts";

/** Dependency injection is internal; the CLI always selects this repository. */
export async function main(
  args = process.argv.slice(2),
  dependencies: RecacheDependencies = {},
): Promise<number> {
  const abort = new AbortController();
  let signalExit = 0;
  const stop = (signal: NodeJS.Signals) => {
    signalExit = 128 + constants.signals[signal];
    abort.abort();
  };
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const options = parseRecacheArguments(
      args,
      process.env.FETCH_DEVEL_RECACHE_INTERVAL,
    );
    if (!options.help && process.env.FETCH_DEVEL !== "recache") {
      console.error("Recache requires FETCH_DEVEL=recache and explicit --live");
      return 2;
    }
    const code = await runRecache(options, { ...dependencies, signal: abort.signal });
    return signalExit || code;
  } catch {
    console.error(
      "Recache failed safely; inspect controlled test failures and capture validation before retrying",
    );
    return signalExit || 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

if (import.meta.main) process.exitCode = await main();
