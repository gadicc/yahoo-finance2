/** Seal the flushed raw report only after its real native proof process exits. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  renameSync,
  rmSync,
  openSync,
  closeSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const phases = ["install", "replay", "package"];
const sources = [
  "scripts/native-platform.ts",
  "scripts/testing/native.ts",
  "src/lib/runtime-detect.ts",
  "src/lib/runtimeGlobal.ts",
  "tests/package/native-platform.spec.ts",
];
const hash = (/** @type {Buffer} */ bytes) =>
  createHash("sha256").update(bytes).digest("hex");
function regular(/** @type {string} */ path) {
  assert(
    lstatSync(path).isFile() &&
      !lstatSync(path).isSymbolicLink() &&
      realpathSync(path) === resolve(path),
    "Expected canonical regular proof file",
  );
  return readFileSync(path);
}

/** Internal root/environment seams support synthetic controls, not CLI overrides.
 * @param {string} phase @param {string} results
 * @param {string} root @param {NodeJS.ProcessEnv} environment
 */
export function sealNativeCoverage(
  phase,
  results,
  root = repository,
  environment = process.env,
) {
  assert(phases.includes(phase), "Unknown native proof phase");
  root = realpathSync(root);
  const directory = resolve(results);
  const outside = relative(root, directory);
  const reverse = relative(directory, root);
  assert(
    isAbsolute(results) &&
      outside &&
      reverse &&
      (isAbsolute(outside) ||
        outside === ".." ||
        outside.startsWith(`..${sep}`)) &&
      (isAbsolute(reverse) ||
        reverse === ".." ||
        reverse.startsWith(`..${sep}`)),
    "Native proof results must be outside the checkout",
  );
  assert(
    realpathSync(directory) === directory &&
      !lstatSync(directory).isSymbolicLink(),
    "Native proof results must be canonical",
  );
  assert.equal(
    regular(join(directory, "owner.txt")).toString(),
    "yahoo-finance2/native-platform-v1\n",
  );
  const context = {
    sha: environment.GITHUB_SHA,
    runId: environment.GITHUB_RUN_ID,
    attempt: environment.GITHUB_RUN_ATTEMPT,
  };
  assert(
    typeof context.sha === "string" &&
      /^[0-9a-f]{40}$/.test(context.sha) &&
      [context.runId, context.attempt].every(
        (value) => typeof value === "string" && /^[1-9][0-9]*$/.test(value),
      ),
    "Current GitHub checkout/run/attempt is required",
  );
  const file = join(directory, "summary.json");
  const summary = JSON.parse(regular(file).toString());
  assert(
    summary.phases?.[phase] === "passed" && summary.status !== "failed",
    "Native phase must have passed before sealing coverage",
  );
  for (const [key, value] of Object.entries(context))
    assert.equal(summary.github?.[key], value, "Native run context changed");
  const sourceHashes = Object.fromEntries(
    sources.map((name) => [name, hash(regular(join(root, name)))]),
  );
  assert.deepEqual(
    summary.proofSourceSha256,
    sourceHashes,
    "Native measured source identity changed",
  );
  const path = `proof-${phase}/lcov.info`;
  const bytes = regular(join(directory, path));
  assert(bytes.length > 0, "Empty native controller coverage");
  const reports = summary.coverageReports ?? {};
  assert(
    !Object.hasOwn(reports, phase),
    "Refusing to reseal an earlier native report",
  );
  assert.deepEqual(
    Object.keys(reports).sort(),
    phases.slice(0, phases.indexOf(phase)).sort(),
    "Earlier native coverage phases must be sealed first",
  );
  reports[phase] = { path, bytes: bytes.length, sha256: hash(bytes) };
  summary.coverageReports = reports;
  const temporary = join(directory, `.coverage-seal-${phase}.json`);
  let created = false;
  try {
    const fd = openSync(temporary, "wx", 0o600);
    created = true;
    try {
      writeFileSync(fd, `${JSON.stringify(summary, null, 2)}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, file);
  } finally {
    if (created) rmSync(temporary, { force: true });
  }
  return reports[phase];
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(
    process.argv.length,
    4,
    "Usage: node scripts/native-coverage.mjs PHASE RESULTS",
  );
  sealNativeCoverage(process.argv[2], process.argv[3]);
}
