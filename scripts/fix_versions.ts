/** Compatibility entrypoint for release callers; rebuilding injects all versions. */
import { buildNpm, parseBuildArgs } from "./build_npm.ts";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function fixVersions(args: string[]): string {
  const options = parseBuildArgs(args);
  if (!options.version) throw new Error("--version is required");
  return buildNpm(options);
}

function isMain(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    console.log(`Built versioned package at ${fixVersions(process.argv.slice(2))}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Version build failed");
    process.exitCode = 1;
  }
}
