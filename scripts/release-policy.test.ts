import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
import { projectIt as test } from "../tests/migration/runner.ts";
import config from "../release.config.mjs";
import {
  checkReleasePolicy,
  checkoutConfigHasCredentials,
} from "./release-policy.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const logger = { log() {}, error() {}, warn() {}, success() {} };
const workflow = readFileSync(
  join(root, ".github/workflows/release.yaml"),
  "utf8",
);

function validWorkflow(text: string) {
  const [prefix, publish] = text.split("  release:\n");
  assert(prefix && publish);
  assert.equal(
    createHash("sha256").update(prefix).digest("hex"),
    "8743575dc0ea2e5bcbb6f9046baa2f97c79b83b2b636519b2cb0c16761e34daf",
  );
  assert.match(publish, /needs: \[branch-policy, tests\]/);
  assert.match(publish, /runs-on: ubuntu-24\.04/);
  assert(
    publish.includes(
      "          fetch-depth: 0\n          persist-credentials: false",
    ),
  );
  assert.equal((publish.match(/persist-credentials:/g) ?? []).length, 1);
  assert(
    publish.includes(
      '    env:\n      NPM_CONFIG_PROVENANCE: "true"\n    steps:',
    ),
  );
  assert.deepEqual(
    [...publish.matchAll(/^\s+(?:- )?run: (.+)$/gm)].map((m) => m[1]),
    [
      "echo 'The Tests workflow passed'",
      "bun run build:npm",
      "node scripts/release-policy.mjs",
      "node node_modules/semantic-release/bin/semantic-release.js",
    ],
  );
  assert(
    publish.indexOf("uses: ./.github/actions/setup") <
      publish.indexOf("run: bun run build:npm"),
  );
  assert.match(
    publish,
    / {6}- name: Release if relevant\n {8}env:\n {10}GITHUB_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}\n/,
  );
  assert(
    publish.includes(
      "      contents: write # create releases\n      issues: write # issue comments and labels\n      pull-requests: write # ditto\n      id-token: write",
    ),
  );
  assert(!publish.includes("deno ") && !publish.includes("> package.json"));
}

test("release workflow retains eligible triggers, Tests/native prerequisite and Node/Bun/provenance order", () => {
  validWorkflow(workflow);
  for (const changed of [
    workflow.replace("needs: [branch-policy, tests]", "needs: branch-policy"),
    workflow.replace(
      "fetch-depth: 0\n          persist-credentials: false",
      "fetch-depth: 0",
    ),
    workflow.replace(
      "fetch-depth: 0\n          persist-credentials: false",
      "fetch-depth: 0\n          persist-credentials: true",
    ),
    workflow.replace("branches:\n      - main", "branches:\n      - dev"),
    workflow.replace(
      'NPM_CONFIG_PROVENANCE: "true"',
      'NPM_CONFIG_PROVENANCE: "false"',
    ),
    workflow.replace("run: bun run build:npm", "run: deno task build:npm"),
    workflow.replace("run: bun run build:npm", "run: echo '{}' > package.json"),
    workflow.replace(
      "run: node scripts/release-policy.mjs",
      "run: bun scripts/release-policy.mjs",
    ),
    workflow.replace(
      "run: node node_modules/semantic-release/bin/semantic-release.js",
      "run: bunx semantic-release",
    ),
  ])
    assert.throws(() => validWorkflow(changed));
  const tests = readFileSync(
    join(root, ".github/workflows/tests.yaml"),
    "utf8",
  );
  assert(tests.includes("uses: ./.github/workflows/native-platforms.yaml"));
  const setup = readFileSync(
    join(root, ".github/actions/setup/action.yml"),
    "utf8",
  );
  for (const required of [
    "node-version: 24.21.0",
    "bun-version-file: .bun-version",
    "bun install --frozen-lockfile",
    "bun run check:toolchain",
  ])
    assert(setup.includes(required));
});

test("pinned semantic-release derives final-step GitHub Git credentials without a stored checkout token", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-release-git-auth-"));
  try {
    const sourceUrl = pathToFileURL(
      join(
        dirname(require.resolve("semantic-release")),
        "lib/get-git-auth-url.js",
      ),
    ).href;
    const stub = join(scratch, "transport.mjs");
    writeFileSync(
      stub,
      "export async function verifyAuth(...args){globalThis.probeGitCalls.push(args);throw new Error('Controlled refusal before authentication/network');}",
    );
    const controller = join(scratch, "controller.mjs");
    writeFileSync(
      controller,
      `import assert from 'node:assert/strict';
import{registerHooks}from'node:module';
assert.equal(process.version,'v24.21.0');
const source=${JSON.stringify(sourceUrl)};
const hooks=registerHooks({resolve(specifier,context,next){if(context.parentURL===source&&specifier==='./git.js')return{url:${JSON.stringify(pathToFileURL(stub).href)},shortCircuit:true};return next(specifier,context);}});
globalThis.probeGitCalls=[];
try{
 const{default:getGitAuthUrl}=await import(source);
 const repositoryUrl='https://github.com/gadicc/yahoo-finance2';
 const env={GITHUB_ACTION:'release',GITHUB_TOKEN:'fixed-synthetic-publisher-token'};
 const context={cwd:${JSON.stringify(scratch)},env,branch:{name:'main'},options:{repositoryUrl}};
 const actual=new URL(await getGitAuthUrl(context));
 assert.equal(actual.protocol,'https:');assert.equal(actual.hostname,'github.com');assert.equal(actual.pathname,'/gadicc/yahoo-finance2');
 assert.equal(actual.username,'x-access-token');assert.equal(actual.password,env.GITHUB_TOKEN);
 assert.equal(globalThis.probeGitCalls.length,1);assert.equal(globalThis.probeGitCalls[0][0],repositoryUrl);
 globalThis.probeGitCalls=[];
 assert.equal(await getGitAuthUrl({...context,env:{GITHUB_ACTION:'release'}}),repositoryUrl);
 assert.equal(globalThis.probeGitCalls.length,1);
 console.log('exact pinned Git URL module; transport replaced; no real authentication');
}finally{hooks.deregister();delete globalThis.probeGitCalls;}
`,
    );
    const child = spawnSync("node", [controller], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /exact pinned Git URL module/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 15000);

test("release branches/channels and real analyzer retain major, ordinary and prerelease semantics", async () => {
  assert.deepEqual(config.branches, [
    "+([0-9])?(.{+([0-9]),x}).x",
    "master",
    "main",
    "next",
    "next-major",
    { name: "beta", prerelease: true },
    { name: "alpha", prerelease: true },
  ]);
  const { analyzeCommits } = await import(
    pathToFileURL(require.resolve("@semantic-release/commit-analyzer")).href
  );
  const nextVersion = (
    await import(
      pathToFileURL(
        join(
          dirname(require.resolve("semantic-release")),
          "lib/get-next-version.js",
        ),
      ).href
    )
  ).default;
  for (const [message, expected] of [
    ["fix(quote): preserve values", "patch"],
    ["feat(runtime): add behavior", "minor"],
    [
      "feat(runtime)!: require Bun 1.4.3\n\nBREAKING CHANGE: Bun consumers require1.4.3",
      "major",
    ],
    ["docs: explain release setup", null],
  ] as const) {
    const type = await analyzeCommits(
      { preset: config.preset },
      { cwd: root, commits: [{ hash: "0123456789abcdef", message }], logger },
    );
    assert.equal(type, expected);
    if (!type) continue;
    for (const [name, channel, prerelease, expectedVersion] of [
      [
        "main",
        null,
        undefined,
        type === "major" ? "5.0.0" : type === "minor" ? "4.3.0" : "4.2.4",
      ],
      [
        "next",
        "next",
        undefined,
        type === "major" ? "5.0.0" : type === "minor" ? "4.3.0" : "4.2.4",
      ],
      [
        "alpha",
        "alpha",
        "alpha",
        `${type === "major" ? "5.0.0" : type === "minor" ? "4.3.0" : "4.2.4"}-alpha.1`,
      ],
      [
        "beta",
        "beta",
        "beta",
        `${type === "major" ? "5.0.0" : type === "minor" ? "4.3.0" : "4.2.4"}-beta.1`,
      ],
    ]) {
      assert.equal(
        nextVersion({
          branch: {
            name,
            type: prerelease ? "prerelease" : "release",
            prerelease,
            tags: [],
          },
          lastRelease: { version: "4.2.3", channels: [null] },
          nextRelease: { type, channel },
          logger,
        }),
        expectedVersion,
      );
    }
  }
});

test("release prebuild precedes pure npm metadata verification and real local prepare without touching private roots", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-release-policy-"));
  try {
    for (const name of ["src", "bin", "skills"])
      cpSync(join(root, name), join(scratch, name), { recursive: true });
    mkdirSync(join(scratch, "scripts"));
    for (const name of ["build_npm.ts", "fix_versions.ts"])
      cpSync(join(root, "scripts", name), join(scratch, "scripts", name));
    for (const name of [
      "package.json",
      "bun.lock",
      "deno.json",
      "LICENSE",
      "README.md",
      ".bun-version",
    ])
      cpSync(join(root, name), join(scratch, name));
    symlinkSync(
      join(root, "node_modules"),
      join(scratch, "node_modules"),
      "dir",
    );
    const snapshot = Object.fromEntries(
      ["package.json", "bun.lock", "deno.json"].map((name) => [
        name,
        readFileSync(join(scratch, name), "utf8"),
      ]),
    );
    const env = {
      ...process.env,
      GITHUB_REF: "refs/heads/main",
      NPM_CONFIG_PROVENANCE: "true",
      PATH: dirname(process.execPath) + delimiter + process.env.PATH,
    };
    const check = () =>
      checkReleasePolicy({ root: scratch, env, nodeVersion: "v24.21.0" });
    assert.throws(check, /ENOENT/);
    // Keep scratch sources outside the covered parent while exercising the real CLI.
    const build = spawnSync(
      process.execPath,
      ["--no-env-file", "scripts/build_npm.ts"],
      { cwd: scratch, env, encoding: "utf8", timeout: 30000 },
    );
    assert.ifError(build.error);
    assert.equal(build.signal, null);
    assert.equal(build.status, 0, build.stderr);
    assert.equal(
      build.stdout.trim(),
      `Built npm package at ${join(scratch, "npm")}`,
    );
    assert.throws(check, /Unable to inspect checkout credential configuration/);
    const git = (args: string[]) => {
      const result = spawnSync("git", ["-C", scratch, ...args], {
        encoding: "utf8",
        timeout: 5000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
    };
    git(["init", "--quiet"]);
    const report = check();
    assert.equal(report.checkoutCredentials, "absent");
    const unrelated = join(scratch, "unrelated-clean-repository");
    git(["init", "--quiet", unrelated]);
    const redirects = [
      { GIT_DIR: join(unrelated, ".git") },
      { GIT_COMMON_DIR: join(unrelated, ".git") },
      { GIT_DIR: join(unrelated, ".git"), GIT_WORK_TREE: unrelated },
      { GIT_CONFIG: join(unrelated, ".git/config") },
      {
        GIT_CONFIG_COUNT: "invalid-count",
        GIT_CONFIG_PARAMETERS: "invalid-parameters",
      },
      {
        GIT_CONFIG_SYSTEM: join(unrelated, "absent"),
        GIT_CONFIG_GLOBAL: join(unrelated, "absent"),
      },
    ];
    const redirected = () =>
      redirects.map(
        (override) => () =>
          checkReleasePolicy({
            root: scratch,
            env: { ...env, ...override },
            nodeVersion: "v24.21.0",
          }),
      );
    for (const control of redirected())
      assert.equal(control().checkoutCredentials, "absent");
    const rejectsQuietly = (control: () => unknown) =>
      assert.throws(control, (error: unknown) => {
        assert(error instanceof Error);
        assert.match(error.message, /Checkout must not store/);
        assert(!error.message.includes("fixed-synthetic-credential-marker"));
        return true;
      });
    for (const key of [
      "http.https://github.com/.extraheader",
      "http.extraheader",
      "credential.helper",
    ]) {
      git(["config", "--local", key, "fixed-synthetic-credential-marker"]);
      for (const control of redirected()) rejectsQuietly(control);
      assert.throws(check, (error: unknown) => {
        assert(error instanceof Error);
        assert.match(error.message, /Checkout must not store/);
        assert(!error.message.includes("fixed-synthetic-credential-marker"));
        return true;
      });
      git(["config", "--local", "--unset-all", key]);
      assert.equal(check().checkoutCredentials, "absent");
    }
    assert.equal(report.exports, 28);
    assert.equal(report.npm, "11.21.1");
    const included = join(scratch, "included-git-config");
    writeFileSync(
      included,
      '[http "https://github.com/"]\n extraheader = fixed-synthetic-credential-marker\n',
    );
    git(["config", "--local", "include.path", included]);
    assert.throws(check, /Checkout must not store/);
    git(["config", "--local", "--unset-all", "include.path"]);
    assert.equal(check().checkoutCredentials, "absent");
    // Exact checkout-v7 topology: gitdir path does not have a trailing slash.
    const includeKey = `includeIf.gitdir:${join(scratch, ".git")}.path`;
    git(["config", "--local", includeKey, included]);
    rejectsQuietly(check);
    for (const control of redirected()) rejectsQuietly(control);
    git(["config", "--local", "--unset-all", includeKey]);
    git(["config", "--local", "extensions.worktreeConfig", "true"]);
    for (const worktreeKey of ["credential.helper", "include.path"]) {
      git([
        "config",
        "--worktree",
        worktreeKey,
        worktreeKey === "include.path"
          ? included
          : "fixed-synthetic-credential-marker",
      ]);
      rejectsQuietly(check);
      for (const control of redirected()) rejectsQuietly(control);
      git(["config", "--worktree", "--unset-all", worktreeKey]);
      assert.equal(check().checkoutCredentials, "absent");
    }
    // includeIf.hasconfig scans the merged local/worktree remote inventory.
    const conditionalKey =
      "includeIf.hasconfig:remote.*.url:https://github.com/**.path";
    for (const [includeScope, remoteScope] of [
      ["--local", "--worktree"],
      ["--worktree", "--local"],
    ]) {
      git(["config", includeScope, conditionalKey, included]);
      assert.equal(check().checkoutCredentials, "absent");
      git([
        "config",
        remoteScope,
        "remote.cross-scope.url",
        "https://github.com/gadicc/yahoo-finance2",
      ]);
      rejectsQuietly(check);
      for (const control of redirected()) rejectsQuietly(control);
      git(["config", remoteScope, "--unset-all", "remote.cross-scope.url"]);
      assert.equal(check().checkoutCredentials, "absent");
      git(["config", includeScope, "--unset-all", conditionalKey]);
    }
    for (const options of [
      { ...env, NPM_CONFIG_PROVENANCE: "false" },
      { ...env, GITHUB_REF: "refs/heads/dev" },
    ])
      assert.throws(() =>
        checkReleasePolicy({
          root: scratch,
          env: options,
          nodeVersion: "v24.21.0",
        }),
      );
    assert.throws(
      () => checkReleasePolicy({ root: scratch, env, nodeVersion: "v22.0.0" }),
      /Node24/,
    );
    const publicPath = join(scratch, "npm/package.json");
    const publicText = readFileSync(publicPath, "utf8");
    const pkg = JSON.parse(publicText);
    for (const bad of [
      { ...pkg, name: undefined },
      { ...pkg, exports: {} },
      { ...pkg, version: "99.0.0" },
      { ...pkg, private: true },
      { ...pkg, engines: { node: ">=20" } },
      { ...pkg, repository: { url: "https://example.invalid/repo" } },
    ]) {
      writeFileSync(publicPath, JSON.stringify(bad));
      assert.throws(check);
    }
    writeFileSync(publicPath, publicText);
    const privatePath = join(scratch, "package.json");
    const privateText = snapshot["package.json"];
    const lockText = snapshot["bun.lock"];
    assert.equal(typeof privateText, "string");
    assert.equal(typeof lockText, "string");
    assert(privateText && lockText);
    const privatePkg = JSON.parse(privateText);
    for (const bad of [
      { ...privatePkg, private: false },
      { ...privatePkg, packageManager: "bun@1.0.0" },
      {
        ...privatePkg,
        devDependencies: {
          ...privatePkg.devDependencies,
          "semantic-release": "0.0.0",
        },
      },
    ]) {
      writeFileSync(privatePath, JSON.stringify(bad));
      assert.throws(check);
    }
    writeFileSync(privatePath, privateText);
    const lockPath = join(scratch, "bun.lock");
    const changedLock = lockText.replace('"npm@11.21.1"', '"npm@0.0.0"');
    assert.notEqual(changedLock, snapshot["bun.lock"]);
    writeFileSync(lockPath, changedLock);
    assert.throws(check, /Local npm differs/);
    writeFileSync(lockPath, lockText);
    const npmRoot = dirname(require.resolve("@semantic-release/npm"));
    const getPkg = (
      await import(pathToFileURL(join(npmRoot, "lib/get-pkg.js")).href)
    ).default;
    assert.equal(
      (await getPkg({ pkgRoot: "npm" }, { cwd: scratch })).name,
      "yahoo-finance2",
    );
    const execPrepare = (
      await import(
        pathToFileURL(require.resolve("@semantic-release/exec")).href
      )
    ).prepare;
    const output = new PassThrough();
    output.resume();
    const version = "9.8.7-next.3";
    const execConfig = config.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === "@semantic-release/exec",
    );
    assert(Array.isArray(execConfig));
    await execPrepare(execConfig[1], {
      cwd: scratch,
      env,
      stdout: output,
      stderr: output,
      logger,
      nextRelease: { version },
    });
    const rebuilt = JSON.parse(readFileSync(publicPath, "utf8"));
    assert.equal(rebuilt.version, version);
    assert.deepEqual(rebuilt.exports, pkg.exports);
    assert.deepEqual(rebuilt.engines, pkg.engines);
    for (const format of ["esm", "script"]) {
      assert.equal(
        JSON.parse(
          readFileSync(join(scratch, "npm", format, "deno.json"), "utf8"),
        ).version,
        version,
      );
    }
    const prepareNpm = (
      await import(pathToFileURL(join(npmRoot, "lib/prepare.js")).href)
    ).default;
    const npmrc = join(scratch, "empty-npmrc");
    writeFileSync(npmrc, "");
    await prepareNpm(
      npmrc,
      { pkgRoot: "npm" },
      {
        cwd: scratch,
        env,
        stdout: output,
        stderr: output,
        logger,
        nextRelease: { version },
      },
    );
    assert.equal(JSON.parse(readFileSync(publicPath, "utf8")).version, version);
    for (const [name, bytes] of Object.entries(snapshot))
      assert.equal(readFileSync(join(scratch, name), "utf8"), bytes);
    assert(!existsSync(join(scratch, "package-lock.json")));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60000);

test("credential key framing preserves line breaks and rejects malformed scope pairs", () => {
  assert.equal(
    checkoutConfigHasCredentials("global\0credential.helper\0"),
    false,
  );
  assert.equal(
    checkoutConfigHasCredentials("local\0credential.helper\0"),
    true,
  );
  assert.equal(
    checkoutConfigHasCredentials(
      "worktree\0http.https://example.invalid/\nscoped.extraheader\0",
    ),
    true,
  );
  assert.equal(
    checkoutConfigHasCredentials("global\0credential.\nlocal.helper\0"),
    false,
  );
  assert.equal(
    checkoutConfigHasCredentials(
      "system\0credential.helper\0local\0credential.helper\0",
    ),
    true,
  );
  for (const malformed of [
    "",
    "local\0credential.helper",
    "local\0",
    "local\0\0",
    "unknown\0credential.helper\0",
    "global\nlocal\0credential.helper\0",
    "global\0credential.helper\0local\0",
  ]) {
    assert.throws(
      () => checkoutConfigHasCredentials(malformed),
      /Unable to inspect checkout credential configuration/,
    );
  }
});
