import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type {
  PrepareContext,
  PublishContext,
  VerifyConditionsContext,
} from "semantic-release";
import { projectIt as test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import {
  createJsrStage,
  hashFile,
  removeStage,
  stagePlan,
  validateVersion,
  verifyStage,
} from "./publisher/stage.mjs";
import { createJsrHooks } from "./publisher/jsr-hooks.mjs";
import {
  consumerSource,
  sdkNegativeSource,
  assertSdkTypeRejection,
} from "./publisher/consumer.mjs";
import { pathToFileURL } from "node:url";
import { assertPublisherTemporaryPath } from "./publisher/runtime.mjs";
import {
  isolateRehearsalNpm,
  parseRehearsal,
  rehearsalEnvironment,
} from "./publisher/rehearse.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("publisher stage retains public closure and root-derived exact dependencies without development metadata", () => {
  const plan = stagePlan(root);
  const source = JSON.parse(readFileSync(join(root, "deno.json"), "utf8"));
  expect(plan.metadata.exports).toEqual(source.exports);
  expect(Object.keys(plan.metadata.exports)).toHaveLength(28);
  expect(plan.files).toContain("src/lib/timeseries.json");
  expect(plan.files).toContain("src/modules/quote.schema.json");
  expect(
    plan.files.some(
      (file) =>
        file.endsWith(".test.ts") ||
        file.startsWith("tests/") ||
        file.startsWith("scripts/"),
    ),
  ).toBe(false);
  expect(plan.metadata).not.toHaveProperty("tasks");
  expect(plan.metadata).not.toHaveProperty("permissions");
  expect(plan.metadata.imports["@modelcontextprotocol/sdk/server/mcp.js"]).toBe(
    "npm:@modelcontextprotocol/sdk@1.32.0/server/mcp.js",
  );
  expect(plan.metadata.imports["json-schema"]).toBe(
    "npm:@types/json-schema@7.0.15",
  );
  expect(
    Object.keys(plan.metadata.imports).some((key) => key.endsWith("/")),
  ).toBe(false);
});

test("publisher plan rejects unsafe paths, symlink inputs, undeclared dependencies and lock drift", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-publisher-plan-"));
  const pkg = {
    private: true,
    packageManager: "bun@1.4.3",
    dependencies: { zod: "4.6.5" },
    devDependencies: { "@types/json-schema": "7.0.15" },
  };
  const meta = {
    name: "@gadicc/yahoo-finance2",
    version: "1.2.3",
    exports: { ".": "./src/index.ts" },
  };
  const reset = () => {
    writeFileSync(join(scratch, "package.json"), JSON.stringify(pkg));
    writeFileSync(join(scratch, "deno.json"), JSON.stringify(meta));
    writeFileSync(
      join(scratch, "bun.lock"),
      JSON.stringify({ workspaces: { "": pkg } }),
    );
    writeFileSync(join(scratch, "src/index.ts"), "export const safe=1;\n");
  };
  try {
    mkdirSync(join(scratch, "src"));
    for (const name of ["LICENSE", "README.md"])
      writeFileSync(join(scratch, name), "safe");
    reset();
    expect(stagePlan(scratch).files).toContain("src/index.ts");
    writeFileSync(
      join(scratch, "src/index.ts"),
      '// @deno-types="zod/type-path"\nimport * as z from "zod/type-path.js";export {z};',
    );
    expect(stagePlan(scratch).metadata.imports["zod/type-path"]).toBe(
      "npm:zod@4.6.5/type-path",
    );
    for (const hint of [
      "unapproved-package",
      "https://invalid.example/types.ts",
      "file:///not-read/types.ts",
      "../not-read.ts",
      "npm:zod@4.6.4/type-path",
      "zod@4.6.4/type-path",
      "zod/other-types",
    ]) {
      reset();
      writeFileSync(
        join(scratch, "src/index.ts"),
        `// @deno-types=${JSON.stringify(hint)}\nimport * as z from "zod/type-path.js";export {z};`,
      );
      expect(() => stagePlan(scratch)).toThrow("publisher type hint");
    }
    reset();
    writeFileSync(
      join(scratch, "src/index.ts"),
      '// @deno-types="zod/type-path"\n// @deno-types="zod/other"\nimport * as z from "zod/type-path.js";export {z};',
    );
    expect(() => stagePlan(scratch)).toThrow("Contradictory");
    reset();
    writeFileSync(
      join(scratch, "src/index.ts"),
      '// @ts-types="https://invalid.example/types.ts"\nimport * as z from "zod/type-path.js";export {z};',
    );
    expect(() => stagePlan(scratch)).toThrow("Malformed publisher type hint");
    reset();
    writeFileSync(
      join(scratch, "src/index.ts"),
      'import "undeclared-runtime";',
    );
    expect(() => stagePlan(scratch)).toThrow("Undeclared");
    reset();
    writeFileSync(
      join(scratch, "src/index.ts"),
      'const target="./other.ts"; await import(target);',
    );
    expect(() => stagePlan(scratch)).toThrow("Computed");
    reset();
    writeFileSync(join(scratch, "src/index.ts"), 'import "../README.md";');
    expect(() => stagePlan(scratch)).toThrow("Unexpected");
    reset();
    writeFileSync(
      join(scratch, "package.json"),
      JSON.stringify({ ...pkg, dependencies: { zod: "4.6.4" } }),
    );
    expect(() => stagePlan(scratch)).toThrow("lock disagreement");
    reset();
    rmSync(join(scratch, "src/index.ts"));
    symlinkSync(join(root, "src/index.ts"), join(scratch, "src/index.ts"));
    expect(() => stagePlan(scratch)).toThrow("canonical");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("actual publisher stage preserves Git head/origin and refuses source/ownership mutation", () => {
  const before = Object.fromEntries(
    ["package.json", "bun.lock", "deno.json"].map((name) => [
      name,
      hashFile(join(root, name)),
    ]),
  );
  const stage = createJsrStage(root);
  try {
    verifyStage(stage);
    expect(existsSync(join(stage.stage, "package.json"))).toBe(false);
    expect(existsSync(join(stage.stage, "tests"))).toBe(false);
    expect(existsSync(join(stage.stage, "node_modules"))).toBe(false);
    const file = join(stage.stage, "src/index.ts");
    const bytes = readFileSync(file);
    writeFileSync(file, "changed");
    expect(() => verifyStage(stage)).toThrow("Changed");
    writeFileSync(file, bytes);
    const owner = readFileSync(stage.ownerFile);
    writeFileSync(stage.ownerFile, "{}");
    expect(() => removeStage(stage)).toThrow();
    expect(existsSync(stage.stage)).toBe(true);
    writeFileSync(stage.ownerFile, owner);
  } finally {
    removeStage(stage);
  }
  for (const [name, hash] of Object.entries(before))
    expect(hashFile(join(root, name))).toBe(hash);
  expect(existsSync(stage.owner)).toBe(false);
}, 30000);

test("ordinary modeled publisher lifecycle routes only staged version/lock and never invokes Deno", async () => {
  const events: string[] = [];
  let seenStage: ReturnType<typeof createJsrStage> | undefined;
  const hooks = createJsrHooks({
    stage(directory) {
      seenStage = createJsrStage(directory);
      return seenStage;
    },
    acquireLock(stage) {
      writeFileSync(join(stage.stage, "deno.lock"), "model-private-lock");
      return {
        binary: "modeled-only-not-executed",
        version: "2.6.7",
        sha256: "modeled",
        lockSha256: hashFile(join(stage.stage, "deno.lock")),
      };
    },
    api: {
      async verifyConditions(config) {
        assert(seenStage && config.cwd);
        expect(config.cwd).toBe(seenStage.stage);
        expect(existsSync(join(config.cwd, "package.json"))).toBe(false);
        events.push("verify");
      },
      async prepare(config, context) {
        assert(seenStage && config.cwd);
        expect(config.publishArgs).toEqual([]);
        expect(seenStage.metadata.lock.frozen).toBe(true);
        const target = join(config.cwd, "deno.json");
        const meta = JSON.parse(readFileSync(target, "utf8"));
        meta.version = context.nextRelease.version;
        writeFileSync(target, JSON.stringify(meta));
        events.push("prepare");
      },
      async publish(config) {
        assert(seenStage && config.cwd);
        expect(config.cwd).toBe(seenStage.stage);
        expect(config.publishArgs).toEqual([]);
        expect(seenStage.metadata.lock.frozen).toBe(true);
        events.push("modeled-publish-only");
        return { name: "modeled" };
      },
      async success() {
        events.push("success");
      },
      async fail() {
        events.push("fail");
      },
    },
  });
  // Minimal contexts model only consumed lifecycle fields. The real JSR API is never called here.
  const context = { cwd: root, nextRelease: { version: "9.8.7-next.2" } };
  await expect(
    hooks.prepare({}, context as unknown as PrepareContext),
  ).rejects.toThrow("verification");
  await hooks.verifyConditions(
    {},
    context as unknown as VerifyConditionsContext,
  );
  await expect(
    hooks.publish({}, context as unknown as PublishContext),
  ).rejects.toThrow("prepare");
  assert(seenStage);
  const lockPath = join(seenStage.stage, "deno.lock");
  const lockBytes = readFileSync(lockPath);
  writeFileSync(lockPath, "unexpected changed lock");
  await expect(
    hooks.verifyConditions({}, context as unknown as VerifyConditionsContext),
  ).rejects.toThrow("resolution lock changed");
  writeFileSync(lockPath, lockBytes);
  await hooks.prepare({}, context as unknown as PrepareContext);
  await hooks.publish({}, context as unknown as PublishContext);
  assert(seenStage);
  const stagePath = seenStage.owner;
  await hooks.success({}, context as never);
  expect(existsSync(stagePath)).toBe(false);
  expect(events).toEqual([
    "verify",
    "prepare",
    "modeled-publish-only",
    "success",
  ]);
}, 30000);

test("publisher rehearsal requires explicit boundary and clears authentication/live controls", () => {
  for (const args of [
    [],
    ["--results", "/tmp/out"],
    ["--publisher-rehearsal"],
    [
      "--publisher-rehearsal",
      "--results",
      "relative",
      "--version",
      "1.0.0",
      "--bun",
      "/tmp/bun",
    ],
  ])
    expect(() => parseRehearsal(args)).toThrow();
  for (const version of ["1.0.0", "5.0.0-beta.1", "9.8.7+proof"])
    expect(validateVersion(version)).toBe(version);
  for (const version of ["1.0", "1.0.0-beta.01", "../bad", "1.0.0 --publish"])
    expect(() => validateVersion(version)).toThrow();
  expect(() => assertPublisherTemporaryPath("/tmp/safe-path_1")).not.toThrow();
  for (const unsafe of [
    "/tmp/has spaces",
    "/tmp/semi;colon",
    "/tmp/$(command)",
    "/tmp/quote'",
    "/tmp/new\nline",
  ])
    expect(() => assertPublisherTemporaryPath(unsafe)).toThrow("shell-safe");
  const env = rehearsalEnvironment({
    HOME: "/home/example",
    NPM_TOKEN: "secret",
    JSR_TOKEN: "secret",
    GITHUB_TOKEN: "secret",
    ACTIONS_ID_TOKEN_REQUEST_URL: "endpoint",
    NODE_OPTIONS: "preload",
    FETCH_DEVEL: "recache",
    FMC_CACHE_MODE: "record",
    DENO_BIN_CANARY: "1",
    DISABLE_JSR_PROVENANCE: "1",
  });
  expect(env).toEqual({ HOME: "/home/example", DENO_NO_UPDATE_CHECK: "1" });
});

test("SDK consumer negative requires the exact genuine type error rather than an arbitrary failure", () => {
  const exports = JSON.parse(
    readFileSync(join(root, "deno.json"), "utf8"),
  ).exports;
  for (const kind of ["source", "npm"] as const) {
    const positive = consumerSource(
      exports,
      "/tmp/source with spaces",
      kind,
      "9.8.7-next.4",
      "2.6.7",
    );
    expect(positive).toContain('assert.equal(Deno.version.deno,"2.6.7")');
    const negative = sdkNegativeSource(positive);
    expect(negative.startsWith(positive)).toBe(true);
    const file = "/tmp/consumer with spaces/invalid-sdk.ts";
    const line =
      negative
        .split("\n")
        .findIndex((value) => value.startsWith("server.registerTool(123")) + 1;
    const call = "server.registerTool(123, {}, () => ({ content: [] }));";
    const column = call.indexOf("123") + 1;
    const diagnostic = `error: TS2345 [ERROR]: Argument of type 'number' is not assignable to parameter of type 'string'.\n${call}\n                    ~~~\n    at ${pathToFileURL(file).href}:${line}:${column}\n`;
    const valid = { status: 1, stdout: "", stderr: diagnostic };
    expect(assertSdkTypeRejection(valid, file, negative).code).toBe("TS2345");
    expect(
      assertSdkTypeRejection(
        { ...valid, stderr: diagnostic.replaceAll("\n", "\r\n") },
        file,
        negative,
      ).line,
    ).toBe(line);
    for (const observation of [
      { ...valid, status: 0 },
      { ...valid, status: null, signal: "SIGTERM" },
      { ...valid, stderr: diagnostic.replace("TS2345", "TS2307") },
      { ...valid, stderr: diagnostic.replace("'number'", "'boolean'") },
      {
        ...valid,
        stderr: diagnostic.replace(
          call,
          "unrelated.registerTool(123, {}, () => ({ content: [] }));",
        ),
      },
      {
        ...valid,
        stderr: diagnostic.replace("invalid-sdk.ts", "unrelated.ts"),
      },
      {
        ...valid,
        stderr: diagnostic.replace(
          `:${line}:${column}`,
          `:${line + 1}:${column}`,
        ),
      },
      {
        ...valid,
        stderr: diagnostic.replace(
          `:${line}:${column}`,
          `:${line}:${column + 1}`,
        ),
      },
      { ...valid, stderr: `${diagnostic}TS2307: Cannot find module` },
      { ...valid, stderr: "unrelated compilation failure" },
    ])
      expect(() =>
        assertSdkTypeRejection(observation, file, negative),
      ).toThrow();
  }
});

function controlGit(directory: string, args: string[], input?: string) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Private publisher control",
      "-c",
      "user.email=publisher-control@localhost",
      "-C",
      directory,
      ...args,
    ],
    { encoding: "utf8", input, timeout: 30000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function gitControlClone(parent: string) {
  const clone = join(parent, "source");
  controlGit(root, ["clone", "--no-hardlinks", "--local", root, clone]);
  return clone;
}

test("publisher compares raw CRLF and custom-clean source bytes before staging without running filters", () => {
  const parent = mkdtempSync(join(tmpdir(), "yf-publisher-filters-"));
  const originalHome = process.env.HOME;
  try {
    const clone = gitControlClone(parent);
    const file = join(clone, "src/index.ts");
    const bytes = readFileSync(file, "utf8");
    const expected = controlGit(clone, ["rev-parse", "HEAD:src/index.ts"]);
    const home = join(parent, "home");
    mkdirSync(home);
    process.env.HOME = home;
    const config = join(home, ".gitconfig");
    controlGit(clone, ["config", "--file", config, "core.autocrlf", "true"]);
    writeFileSync(file, bytes.replace(/\r?\n/g, "\r\n"));
    expect(controlGit(clone, ["hash-object", file])).toBe(expected);
    expect(controlGit(clone, ["hash-object", "--no-filters", file])).not.toBe(
      expected,
    );
    expect(() => createJsrStage(clone, parent)).toThrow(
      "Uncommitted publisher input: src/index.ts",
    );
    controlGit(clone, ["config", "--file", config, "core.autocrlf", "false"]);
    const attributes = join(parent, "attributes");
    writeFileSync(attributes, "*.ts filter=publisher-control\n");
    const filter = join(parent, "clean.mjs");
    const calls = join(parent, "filter-calls");
    const marker = "export const publisherFilterSubstitution = true;\n";
    writeFileSync(
      filter,
      `import{readFileSync,appendFileSync}from"node:fs";appendFileSync(${JSON.stringify(calls)},"called\\n");process.stdout.write(readFileSync(0,"utf8").replace(${JSON.stringify(marker)},""));`,
    );
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    controlGit(clone, [
      "config",
      "--file",
      config,
      "core.attributesFile",
      attributes,
    ]);
    controlGit(clone, [
      "config",
      "--file",
      config,
      "filter.publisher-control.clean",
      `${quote(process.execPath)} ${quote(filter)}`,
    ]);
    writeFileSync(file, bytes + marker);
    expect(controlGit(clone, ["hash-object", file])).toBe(expected);
    expect(controlGit(clone, ["hash-object", "--no-filters", file])).not.toBe(
      expected,
    );
    const before = readFileSync(calls, "utf8");
    expect(() => createJsrStage(clone, parent)).toThrow(
      "Uncommitted publisher input: src/index.ts",
    );
    expect(readFileSync(calls, "utf8")).toBe(before);
    writeFileSync(file, bytes);
    const stage = createJsrStage(clone, parent);
    try {
      verifyStage(stage);
      expect(readFileSync(join(stage.stage, "src/index.ts"), "utf8")).toBe(
        bytes,
      );
    } finally {
      removeStage(stage);
    }
    expect(readFileSync(calls, "utf8")).toBe(before);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(parent, { recursive: true, force: true });
  }
}, 30000);

test("publisher ignores ordinary and inherited tag-base replacement objects and accepts original HEAD bytes", () => {
  const parent = mkdtempSync(join(tmpdir(), "yf-publisher-replace-"));
  const originalBase = process.env.GIT_REPLACE_REF_BASE;
  try {
    const clone = gitControlClone(parent);
    const file = join(clone, "src/index.ts");
    const bytes = readFileSync(file, "utf8");
    const head = controlGit(clone, ["rev-parse", "HEAD"]);
    const expected = controlGit(clone, ["rev-parse", "HEAD:src/index.ts"]);
    writeFileSync(
      file,
      `${bytes}\nexport const publisherReplacement = true;\n`,
    );
    controlGit(clone, ["add", "--", "src/index.ts"]);
    const replacementTree = controlGit(clone, ["write-tree"]);
    const replacement = controlGit(
      clone,
      ["commit-tree", replacementTree, "-p", head],
      "Private publisher replacement control only\n",
    );
    controlGit(clone, ["replace", head, replacement]);
    expect(controlGit(clone, ["rev-parse", `${head}:src/index.ts`])).not.toBe(
      expected,
    );
    expect(() => createJsrStage(clone, parent)).toThrow(
      "Uncommitted publisher input: src/index.ts",
    );
    controlGit(clone, ["replace", "--delete", head]);
    // This SHA-named private tag is cloned, unlike ordinary refs/replace.
    controlGit(clone, ["update-ref", `refs/tags/${head}`, replacement]);
    process.env.GIT_REPLACE_REF_BASE = "refs/tags/";
    expect(controlGit(clone, ["rev-parse", `${head}:src/index.ts`])).not.toBe(
      expected,
    );
    expect(() => createJsrStage(clone, parent)).toThrow(
      "Uncommitted publisher input: src/index.ts",
    );
    writeFileSync(file, bytes);
    const stage = createJsrStage(clone, parent);
    try {
      verifyStage(stage);
      expect(stage.head).toBe(head);
      expect(readFileSync(join(stage.stage, "src/index.ts"), "utf8")).toBe(
        bytes,
      );
    } finally {
      removeStage(stage);
    }
  } finally {
    if (originalBase === undefined) delete process.env.GIT_REPLACE_REF_BASE;
    else process.env.GIT_REPLACE_REF_BASE = originalBase;
    rmSync(parent, { recursive: true, force: true });
  }
}, 30000);

test("publisher rejects unsupported lexical type references before resolving their targets", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-publisher-type-closure-"));
  const pkg = {
    private: true,
    packageManager: "bun@1.4.3",
    dependencies: { zod: "4.6.5" },
    devDependencies: { "@types/json-schema": "7.0.15" },
  };
  try {
    mkdirSync(join(scratch, "src"));
    for (const name of ["LICENSE", "README.md"])
      writeFileSync(join(scratch, name), "safe");
    writeFileSync(join(scratch, "package.json"), JSON.stringify(pkg));
    writeFileSync(
      join(scratch, "bun.lock"),
      JSON.stringify({ workspaces: { "": pkg } }),
    );
    writeFileSync(
      join(scratch, "deno.json"),
      JSON.stringify({
        name: "@gadicc/yahoo-finance2",
        version: "1.2.3",
        exports: { ".": "./src/index.ts" },
      }),
    );
    const external = pathToFileURL(join(scratch, "outside-unread.d.ts")).href;
    for (const code of [
      `// @deno-types="${external}"\nexport { value } from "./not-read.ts";`,
      `// @ts-types="${external}"\nexport * from "./not-read.ts";`,
      `/// <reference types="${external}" />\nexport const value=1;`,
      `/// <reference path="${external}" />\nexport const value=1;`,
      '/// <reference lib="esnext" />\nexport const value=1;',
      `/* @deno-types="${external}" */\nexport const value=1;`,
      `export const value=1;\n// @deno-types="${external}"`,
      `export function f(){\n// @deno-types="${external}"\nreturn 1;\n}`,
    ]) {
      writeFileSync(join(scratch, "src/index.ts"), code);
      expect(() => stagePlan(scratch)).toThrow(
        /Unsupported publisher (type hint|triple-slash reference)/,
      );
      expect(existsSync(join(scratch, "outside-unread.d.ts"))).toBe(false);
    }
    // Directive-looking text inside actual strings/templates/regexes is not a reference.
    writeFileSync(
      join(scratch, "src/index.ts"),
      [
        'export const a = "// @deno-types=unread";',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: This fixture must contain an actual template expression for lexical boundary coverage.
        'export const b = `template ${"safe"} // @ts-types=unread`;',
        "export const c = /@deno-types/;",
        'export const d = "/// <reference path=unread />";',
        "// harmless comment",
        '// @deno-types="zod/type-path"',
        'import * as z from "zod/type-path.js"; export {z};',
      ].join("\n"),
    );
    expect(stagePlan(scratch).metadata.imports["zod/type-path"]).toBe(
      "npm:zod@4.6.5/type-path",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("rehearsal npm cannot load ambient user/global config or case-varied auth channels", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-publisher-npm-config-"));
  try {
    const ambient = join(scratch, "ambient-global.npmrc");
    const ambientUser = join(scratch, "ambient-user.npmrc");
    for (const file of [ambient, ambientUser])
      writeFileSync(
        file,
        "//registry.npmjs.org/:_authToken=FAKE_PUBLISHER_CONTROL\nregistry=https://ambient.invalid/\n",
      );
    const inherited = {
      PATH: process.env.PATH,
      NPM_CONFIG_GLOBALCONFIG: ambient,
      npm_CONFIG_userconfig: ambientUser,
      NpM_CoNfIg__AuTh: "FAKE_PUBLISHER_CONTROL",
      NPM_CONFIG_REGISTRY: "https://ambient.invalid/",
      NPM_CONFIG_PREFIX: "/not-used",
      NPM_AUTH: "FAKE_PUBLISHER_CONTROL",
      _auth: "FAKE_PUBLISHER_CONTROL",
      NODE_AUTH_TOKEN: "FAKE_PUBLISHER_CONTROL",
    };
    const env = rehearsalEnvironment(inherited);
    expect(Object.keys(env).some((name) => /npm_config|auth/i.test(name))).toBe(
      false,
    );
    env.HOME = join(scratch, "home");
    env.USERPROFILE = env.HOME;
    mkdirSync(env.HOME);
    const args = isolateRehearsalNpm(env, scratch);
    const npm = join(
      dirname(createRequire(import.meta.url).resolve("npm/package.json")),
      "bin/npm-cli.js",
    );
    const inspect = (environment: NodeJS.ProcessEnv, flags: string[]) => {
      const child = spawnSync(
        "node",
        [npm, ...flags, "config", "list", "--offline"],
        {
          cwd: scratch,
          env: environment,
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stderr);
      return child.stdout;
    };
    const exposed = inspect(
      {
        PATH: inherited.PATH,
        HOME: env.HOME,
        NPM_CONFIG_GLOBALCONFIG: ambient,
      },
      [],
    );
    expect(exposed).toContain(ambient);
    expect(exposed).toContain("_authToken = (protected)");
    const clean = inspect(env, args);
    expect(clean).not.toContain(ambient);
    expect(clean).not.toContain(ambientUser);
    expect(clean).not.toContain("ambient.invalid");
    expect(clean).not.toContain("_auth");
    expect(clean).toContain(env.npm_config_userconfig);
    expect(clean).toContain(env.npm_config_globalconfig);
    // User CLI binding wins; global env is deliberately rebound after sanitation.
    // npm 11 globalconfig CLI alone does not override a conflicting env value.
    const cliBound = inspect(
      {
        ...env,
        npm_config_userconfig: ambientUser,
      },
      args,
    );
    expect(cliBound).not.toContain("_auth");
    expect(cliBound).not.toContain("ambient.invalid");
    for (const file of [
      env.npm_config_userconfig,
      env.npm_config_globalconfig,
    ]) {
      assert(file);
      expect(readFileSync(file, "utf8")).toBe("");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 30000);

test("publisher classifies ASCII and Unicode fold variants of Deno/TS hints before resolution", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-publisher-hint-case-"));
  const pkg = {
    private: true,
    packageManager: "bun@1.4.3",
    dependencies: { zod: "4.6.5" },
    devDependencies: { "@types/json-schema": "7.0.15" },
  };
  const variants = (marker: string): string[] => {
    const at = marker.search(/[a-z]/);
    if (at < 0) return [marker];
    const prefix = marker.slice(0, at),
      letter = marker[at];
    return variants(marker.slice(at + 1)).flatMap((tail) => [
      prefix + letter + tail,
      prefix + letter.toUpperCase() + tail,
      ...(letter === "s" ? [`${prefix}ſ${tail}`] : []),
    ]);
  };
  try {
    mkdirSync(join(scratch, "src"));
    for (const name of ["LICENSE", "README.md"])
      writeFileSync(join(scratch, name), "safe");
    writeFileSync(join(scratch, "package.json"), JSON.stringify(pkg));
    writeFileSync(
      join(scratch, "bun.lock"),
      JSON.stringify({ workspaces: { "": pkg } }),
    );
    writeFileSync(
      join(scratch, "deno.json"),
      JSON.stringify({
        name: "@gadicc/yahoo-finance2",
        version: "1.2.3",
        exports: { ".": "./src/index.ts" },
      }),
    );
    // Exhaust the Unicode scalar range for simple /iu folds of this alphabet.
    // U+017F is the only non-ASCII equivalent; it folds to s/S in these markers.
    const nonAsciiFolds: string[] = [];
    for (let point = 128; point <= 0x10ffff; point++) {
      const character = String.fromCodePoint(point);
      if (/^[denotyps]$/iu.test(character)) nonAsciiFolds.push(character);
    }
    expect(nonAsciiFolds).toEqual(["ſ"]);
    const markers = [...variants("deno-types"), ...variants("ts-types")];
    expect(new Set(markers).size).toBe(1056);
    for (const marker of markers) {
      writeFileSync(
        join(scratch, "src/index.ts"),
        `// @${marker}="zod/type-path"\nimport * as z from "zod/type-path.js"; export {z};`,
      );
      if (marker === "deno-types")
        expect(stagePlan(scratch).metadata.imports["zod/type-path"]).toBe(
          "npm:zod@4.6.5/type-path",
        );
      else
        expect(() => stagePlan(scratch)).toThrow(
          "Malformed publisher type hint",
        );
      writeFileSync(
        join(scratch, "src/index.ts"),
        `// @${marker}="file:///not-read.d.ts"\nexport {value} from "./not-read.ts";`,
      );
      expect(() => stagePlan(scratch)).toThrow(
        "Unsupported publisher type hint",
      );
    }
    for (const code of [
      '// @deno-types="zod/type-path" @DENO-TYPES="file:///not-read.d.ts"\nimport * as z from "zod/type-path.js";',
      '// @deno-types="zod/type-path"\n// @DENO-TYPES="file:///not-read.d.ts"\nimport * as z from "zod/type-path.js";',
      '/* @Ts-TyPeS="file:///not-read.d.ts" */\nexport const safe=1;',
      '// @deno-types="zod/type-path" @deno-typeſ="file:///not-read.d.ts"\nimport * as z from "zod/type-path.js";',
      '// @deno-types="zod/type-path"\n// @tſ-typeſ="file:///not-read.d.ts"\nimport * as z from "zod/type-path.js";',
      '/* @deno-typeſ="file:///not-read.d.ts" */\nexport const safe=1;',
      'export const safe=1;\n// @DENO-TYPES="file:///not-read.d.ts"',
    ]) {
      writeFileSync(join(scratch, "src/index.ts"), code);
      expect(() => stagePlan(scratch)).toThrow(/publisher type hint/);
    }
    // Preserve actual lexical text boundaries for the now case-insensitive classifier.
    writeFileSync(
      join(scratch, "src/index.ts"),
      [
        'export const text="// @DENO-TYPES=unread";',
        "export const template=`// @TS-TYPES=unread`;",
        "export const pattern=/@DeNo-TyPeS/;",
        'export const unicodeText="// @deno-typeſ=unread";',
        "export const unicodeTemplate=`// @tſ-typeſ=unread`;",
        "export const unicodePattern=/@deno-typeſ/;",
      ].join("\n"),
    );
    expect(stagePlan(scratch).files).toContain("src/index.ts");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 30000);

test("publisher refuses reference-bearing comments across Unicode whitespace without rejecting literal text", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-publisher-reference-space-"));
  const pkg = {
    private: true,
    packageManager: "bun@1.4.3",
    dependencies: {},
    devDependencies: { "@types/json-schema": "7.0.15" },
  };
  try {
    mkdirSync(join(scratch, "src"));
    for (const name of ["README.md", "LICENSE"])
      writeFileSync(join(scratch, name), "safe");
    for (const [name, data] of Object.entries({
      "package.json": pkg,
      "bun.lock": { workspaces: { "": pkg } },
      "deno.json": {
        name: "@gadicc/yahoo-finance2",
        version: "1.2.3",
        exports: { ".": "./src/index.ts" },
      },
    }))
      writeFileSync(join(scratch, name), JSON.stringify(data));
    const spaces: string[] = [];
    for (let point = 0; point <= 0x10ffff; point++) {
      const character = String.fromCodePoint(point);
      if (/^\p{White_Space}$/u.test(character)) spaces.push(character);
    }
    expect(spaces).toHaveLength(25);
    expect(spaces).toContain("\u0085");
    let cases = 0;
    for (const space of spaces)
      for (const attribute of ["path", "types", "lib"])
        for (const position of [
          "prefix",
          "attribute",
          "beforeEquals",
          "afterEquals",
          "close",
        ])
          for (const layout of ["line", "block"]) {
            // ECMAScript line terminators end // comments; use block layout for those prefix cases.
            if (
              layout === "line" &&
              position === "prefix" &&
              /[\n\r\u2028\u2029]/u.test(space)
            )
              continue;
            const gap = (slot: string) => (position === slot ? space : " ");
            const directive = `${gap("prefix")}<ReFeReNcE${gap("attribute")}${attribute}${gap("beforeEquals")}=${gap("afterEquals")}"file:///not-read.d.ts"${gap("close")}/>`;
            const comment =
              layout === "line" ? `///${directive}` : `/*/${directive}*/`;
            writeFileSync(
              join(scratch, "src/index.ts"),
              `${comment}\nexport const safe=1;`,
            );
            expect(() => stagePlan(scratch)).toThrow(
              "Unsupported publisher triple-slash reference",
            );
            cases++;
          }
    expect(cases).toBe(738);
    // Deliberately conservative: harmless reference examples/JSDoc generics are unsupported comments too.
    for (const comment of [
      "/* harmless <reference example */",
      "/** @example <Reference<T>> */",
      "// unrelated text <reference lib='esnext' />",
    ]) {
      writeFileSync(
        join(scratch, "src/index.ts"),
        `${comment}\nexport const safe=1;`,
      );
      expect(() => stagePlan(scratch)).toThrow("reference");
    }
    writeFileSync(
      join(scratch, "src/index.ts"),
      [
        "/// Ordinary explanation, like current production comments.",
        'export const string="///\u0085<reference path=unread />";',
        "export const template=`/*/<reference types=unread />*/`;",
        "export const pattern=/<reference/;",
      ].join("\n"),
    );
    expect(stagePlan(scratch).files).toContain("src/index.ts");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 30000);
