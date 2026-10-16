/** Read-only publisher preflight. Only a bounded local Git config query; no authentication or registry call. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isAllowedWorkflowRef } from "./workflow-policy.mjs";
import releaseConfig from "../release.config.mjs";
import { MIN_SUPPORTED_RUNTIMES } from "../src/lib/runtime-detect.ts";

/** @param {string} file */
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
/** @param {string} value */
const repositoryUrl = (value) =>
  value
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

/** Parse Git's NUL-paired scope/key output without treating key line breaks as records.
 * @param {string} output
 */
export function checkoutConfigHasCredentials(output) {
  const message = "Unable to inspect checkout credential configuration";
  assert(output.endsWith("\0"), message);
  const fields = output.slice(0, -1).split("\0");
  assert(fields.length % 2 === 0, message);
  let found = false;
  for (let index = 0; index < fields.length; index += 2) {
    const scope = fields[index];
    assert(
      ["system", "global", "local", "worktree", "command"].includes(scope),
      message,
    );
    assert(fields[index + 1].length > 0, message);
    if (scope === "local" || scope === "worktree") found = true;
  }
  return found;
}

/** @param {{root?:string,env?:NodeJS.ProcessEnv,nodeVersion?:string}} [options] */
export function checkReleasePolicy(options = {}) {
  const root = realpathSync(
    options.root ?? fileURLToPath(new URL("../", import.meta.url)),
  );
  const env = options.env ?? process.env;
  assert.equal(
    options.nodeVersion ?? process.version,
    "v24.21.0",
    "Release requires the pinned Node24.21 tool host",
  );
  assert(
    isAllowedWorkflowRef("release", env.GITHUB_REF),
    "Release requires a configured branch ref",
  );
  assert.equal(
    env.NPM_CONFIG_PROVENANCE,
    "true",
    "Release requires explicit npm provenance",
  );
  const rootManifest = json(join(root, "package.json"));
  assert.equal(
    rootManifest.private,
    true,
    "Root package.json must remain private",
  );
  const bunPin = readFileSync(join(root, ".bun-version"), "utf8").trim();
  assert.equal(
    rootManifest.packageManager,
    `bun@${bunPin}`,
    "Bun pin metadata differs",
  );
  const parsed = ts.parseConfigFileTextToJson(
    "bun.lock",
    readFileSync(join(root, "bun.lock"), "utf8"),
  );
  assert(!parsed.error, "Malformed authoritative Bun lock");
  /** @type {{packages:Record<string,unknown[]>}} */
  const lock = parsed.config;
  const require = createRequire(join(root, "package.json"));
  const installedTools = Object.fromEntries(
    ["semantic-release", "@semantic-release/npm"].map((name) => {
      const entry = require.resolve(name);
      const metadata = json(join(dirname(entry), "package.json"));
      assert.equal(
        metadata.version,
        rootManifest.devDependencies[name],
        `Installed ${name} differs from root pin`,
      );
      assert.equal(
        lock.packages[name]?.[0],
        `${name}@${metadata.version}`,
        `Locked ${name} differs from installed tool`,
      );
      return [name, metadata.version];
    }),
  );
  // npm plugin13 uses execa(preferLocal:true) from checkout cwd. Bind that exact bin.
  const npmCli = realpathSync(join(root, "node_modules/.bin/npm"));
  const npmMetadata = json(join(dirname(npmCli), "../package.json"));
  assert.equal(npmMetadata.name, "npm", "Local publisher bin must be npm");
  assert.equal(
    lock.packages.npm?.[0],
    `npm@${npmMetadata.version}`,
    "Local npm differs from frozen lock",
  );
  assert.equal(
    npmMetadata.version,
    "11.21.1",
    "Re-review publisher behavior when the pinned npm changes",
  );
  const source = json(join(root, "deno.json"));
  const pkg = json(join(root, "npm/package.json"));
  assert.equal(
    pkg.name,
    "yahoo-finance2",
    "Build public npm metadata before publisher verification",
  );
  assert.notEqual(
    pkg.private,
    true,
    "Generated public package must not be private",
  );
  assert.equal(
    pkg.version,
    source.version,
    "Preflight requires the initial source-version build",
  );
  assert.deepEqual(
    Object.keys(pkg.exports),
    Object.keys(source.exports),
    "Prebuilt public export inventory differs",
  );
  assert.equal(
    Object.keys(pkg.exports).length,
    28,
    "Review release inventory when public exports change",
  );
  assert.deepEqual(
    pkg.engines,
    {
      node: `>=${MIN_SUPPORTED_RUNTIMES.node}`,
      bun: `>=${MIN_SUPPORTED_RUNTIMES.bun}`,
    },
    "Prebuilt consumer engines differ from canonical policy",
  );
  assert.equal(
    repositoryUrl(pkg.repository.url),
    repositoryUrl(releaseConfig.repositoryUrl),
    "Public repository metadata differs from release identity",
  );
  // Ubuntu release host: bind fixed Git to this canonical checkout. Ambient
  // GIT_* variables may redirect repository/config discovery or trace values.
  const gitEnvironment = { ...env };
  for (const key of Object.keys(gitEnvironment))
    if (key.toUpperCase().startsWith("GIT_")) delete gitEnvironment[key];
  gitEnvironment.GIT_TERMINAL_PROMPT = "0";
  gitEnvironment.GIT_OPTIONAL_LOCKS = "0";
  /** @param {string[]} args */
  const query = (args) =>
    spawnSync("/usr/bin/git", ["-C", root, ...args], {
      env: gitEnvironment,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 16384,
      windowsHide: true,
    });
  const checkout = query(["rev-parse", "--show-toplevel"]);
  assert(
    !checkout.error && checkout.status === 0 && checkout.stdout.trim() === root,
    "Unable to inspect checkout credential configuration",
  );
  // Evaluate includeIf conditions using merged configuration before selecting
  // checkout scopes. Key names and scopes are NUL framed, never values.
  const credentials = query([
    "config",
    "--includes",
    "--show-scope",
    "--name-only",
    "--null",
    "--get-regexp",
    "^(http(\\..*)?\\.extraheader|credential(\\..*)?)$",
  ]);
  assert(
    !credentials.error &&
      (credentials.status === 0 || credentials.status === 1),
    "Unable to inspect checkout credential configuration",
  );
  if (credentials.status === 1)
    assert(
      credentials.stdout === "",
      "Unable to inspect checkout credential configuration",
    );
  else
    assert(
      !checkoutConfigHasCredentials(credentials.stdout),
      "Checkout must not store HTTP authorization headers or credential configuration",
    );

  return {
    checkoutCredentials: "absent",
    node: options.nodeVersion ?? process.version,
    bunPin,
    installedTools,
    npm: npmMetadata.version,
    npmCli,
    publicPackage: pkg.name,
    version: pkg.version,
    exports: Object.keys(pkg.exports).length,
    provenance: true,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(
      process.argv.length,
      2,
      "Release preflight accepts no arguments",
    );
    console.log(JSON.stringify(checkReleasePolicy()));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Release preflight failed",
    );
    process.exitCode = 1;
  }
}
