// Preserve the separately selected consumer runtime before setup-bun replaces it.
import assert from "node:assert/strict";
import { MIN_SUPPORTED_RUNTIMES } from "../src/lib/runtime-detect.ts";
import { appendFileSync, chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const source = process.env.YF_MINIMUM_SOURCE;
const expected = process.env.YF_MINIMUM_VERSION;
const output = process.env.GITHUB_ENV;
const temporary = process.env.RUNNER_TEMP;
assert(
  source && expected && output && temporary,
  "Missing runtime-copy inputs",
);
assert.equal(
  expected,
  MIN_SUPPORTED_RUNTIMES.bun,
  "Expected current consumer minimum",
);
const version = spawnSync(source, ["--version"], { encoding: "utf8" });
assert.ifError(version.error);
assert.equal(version.status, 0, version.stderr);
assert.equal(version.stdout.trim(), expected);
const target = join(
  temporary,
  "yf-consumer-runtime",
  process.platform === "win32" ? "bun.exe" : "bun",
);
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
appendFileSync(
  output,
  `YF_MINIMUM_BUN=${target}\nYF_MINIMUM_VERSION=${expected}\n`,
);
