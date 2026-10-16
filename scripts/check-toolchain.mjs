// @ts-check
// Resolve metadata relative to this script so the check also works outside cwd.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

try {
  const version = readFileSync(
    new URL("../.bun-version", import.meta.url),
    "utf8",
  ).trim();
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(".bun-version must contain one exact stable Bun version.");
  }
  if (manifest.packageManager !== `bun@${version}`) {
    throw new Error(
      `Pin mismatch: package.json packageManager must be bun@${version}. Update both pins together.`,
    );
  }
  if (!existsSync(new URL("../bun.lock", import.meta.url))) {
    throw new Error(
      "Missing root bun.lock. Restore the committed lockfile before installing; do not resolve a new graph.",
    );
  }
  for (const name of [
    "pnpm-lock.yaml",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "bun.lockb",
  ]) {
    if (existsSync(new URL(`../${name}`, import.meta.url))) {
      throw new Error(
        `Unexpected root ${name}. bun.lock is authoritative; remove the competing root lockfile.`,
      );
    }
  }
  const runtime = process.versions.bun;
  if (runtime !== version) {
    throw new Error(
      `Expected Bun ${version}; running ${
        runtime ? `Bun ${runtime}` : "Node.js"
      }. Select the pinned Bun binary, then run bun run check:toolchain.`,
    );
  }
  // The offline test launcher also resolves "bun" from PATH.
  const selected = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (
    selected.error ||
    selected.status !== 0 ||
    selected.stdout.trim() !== version
  ) {
    throw new Error(
      `PATH must resolve bun to ${version}. Install/select that version and check bun --version before retrying.`,
    );
  }
  const agent = process.env.npm_config_user_agent;
  if (
    agent &&
    !agent.startsWith(`bun/${version} `) &&
    agent !== `bun/${version}`
  ) {
    throw new Error(
      `Use Bun ${version} for root dependencies and scripts (received ${
        agent.split(" ")[0]
      }). Run bun install --frozen-lockfile, then bun run <script>.`,
    );
  }
  console.log(
    `Toolchain OK: Bun ${version}; root package manager bun; lockfile bun.lock.`,
  );
} catch (error) {
  console.error(
    `Toolchain check failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  console.error("See CONTRIBUTING.md: Bun migration branch bootstrap.");
  process.exitCode = 1;
}
