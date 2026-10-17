/** Explicit isolated publisher verification; ordinary tests/builds never call Deno. */
import assert from "node:assert/strict";
import {
  consumerSource,
  sdkNegativeSource,
  assertSdkTypeRejection,
} from "./consumer.mjs";
import { runtimeObservationSource } from "./observe-runtime.mjs";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyConditions,
  prepare,
  parseConfig,
  removeTemporaryBinFolder,
} from "@sebbo2002/semantic-release-jsr";
import {
  acquirePublisherLock,
  freezePublisherLock,
  assertPublisherTemporaryPath,
} from "./runtime.mjs";
import { tmpdir } from "node:os";
import {
  createJsrStage,
  hashFile,
  validateVersion,
  verifyStage,
} from "./stage.mjs";

/** @param {string[]} args */
export function parseRehearsal(args) {
  assert.equal(
    args[0],
    "--publisher-rehearsal",
    "Explicit --publisher-rehearsal is required; this command owns Deno execution",
  );
  /** @type {Record<string,string>} */
  const options = {};
  for (let index = 1; index < args.length; index++) {
    const key = args[index];
    const value = args[++index];
    assert(
      ["--results", "--version", "--bun", "--minimum-deno"].includes(key) &&
        value &&
        !value.startsWith("--") &&
        !options[key],
      "Unknown, missing or duplicate publisher option",
    );
    options[key] = value;
  }
  for (const key of ["--results", "--bun"])
    assert(
      options[key] && isAbsolute(options[key]),
      `Publisher ${key} must be absolute`,
    );
  validateVersion(options["--version"]);
  if (options["--minimum-deno"])
    assert(
      isAbsolute(options["--minimum-deno"]),
      "Minimum Deno path must be absolute",
    );
  return options;
}

/** A publisher process deliberately has no local authentication or token endpoints. @param {NodeJS.ProcessEnv} inherited */
export function rehearsalEnvironment(inherited) {
  const env = { ...inherited };
  for (const name of Object.keys(env))
    if (
      /(?:TOKEN|PASSWORD|SECRET|AUTHORIZATION)|(?:^|_)AUTH(?:_|$)|^NPM_CONFIG(?:_|$)|^(?:NODE_OPTIONS|BUN_OPTIONS|DENO_BIN_PATH|DENO_BIN_CANARY|DENO_DIR|DENO_AUTH_TOKENS|JSR_URL|JSR_API_URL|DISABLE_JSR_|DENO_INTERNAL_|FETCH_DEVEL|FMC_)/i.test(
        name,
      )
    )
      delete env[name];
  delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
  delete env.GITHUB_ACTIONS;
  env.DENO_NO_UPDATE_CHECK = "1";
  return env;
}

/** Bind both npm configuration tiers to new private empty files.
 * @param {NodeJS.ProcessEnv} env @param {string} directory
 */
export function isolateRehearsalNpm(env, directory) {
  const user = join(directory, "empty-user.npmrc");
  const global = join(directory, "empty-global.npmrc");
  for (const file of [user, global])
    writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  env.npm_config_userconfig = user;
  env.npm_config_globalconfig = global;
  // User CLI binding wins. npm 11 globalconfig CLI assigns a default, so
  // sanitation plus the matching private global env binding is also required.
  return ["--userconfig", user, "--globalconfig", global];
}

/** @param {ReturnType<typeof parseRehearsal>} options */
export async function rehearse(options) {
  assert.equal(
    process.platform,
    "linux",
    "This bounded publisher rehearsal owns Linux guard/PTY controls",
  );
  assert(
    process.versions.node.startsWith("24."),
    "Isolated publisher controller requires Node 24",
  );
  const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
  const output = resolve(options["--results"]);
  const outside = relative(root, output);
  const parent = relative(output, root);
  assert(
    outside &&
      (isAbsolute(outside) ||
        outside === ".." ||
        outside.startsWith(`..${sep}`)) &&
      parent &&
      (isAbsolute(parent) || parent === ".." || parent.startsWith(`..${sep}`)),
    "Publisher results must be outside checkout without overlap",
  );
  assert.equal(
    realpathSync(dirname(output)),
    dirname(output),
    "Publisher results parent must be canonical",
  );
  assert(!existsSync(output), "Publisher rehearsal results must be new");
  mkdirSync(output, { mode: 0o700 });
  const sourceBefore = Object.fromEntries(
    ["package.json", "bun.lock", "deno.json"].map((name) => [
      name,
      hashFile(join(root, name)),
    ]),
  );
  const env = rehearsalEnvironment(process.env);
  env.DENO_DIR = join(output, "deno-cache");
  env.HOME = join(output, "home");
  env.USERPROFILE = env.HOME;
  mkdirSync(env.HOME);
  const npmConfig = isolateRehearsalNpm(env, output);
  /** @type {Array<{name:string,bin:string,args:string[],cwd:string,status:number|null,signal:NodeJS.Signals|null,error?:string}>} */ const commands =
    [];
  /** @param {string} name @param {string} bin @param {string[]} args @param {string} [cwd] @param {number} [expected] */
  const run = (name, bin, args, cwd = root, expected = 0) => {
    const child = spawnSync(bin, args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(join(output, `${name}.stdout`), child.stdout ?? "");
    writeFileSync(join(output, `${name}.stderr`), child.stderr ?? "");
    commands.push({
      name,
      bin,
      args,
      cwd,
      status: child.status,
      signal: child.signal,
      error: child.error?.message,
    });
    assert.ifError(child.error);
    assert.equal(
      child.status,
      expected,
      `${name} failed; inspect retained logs`,
    );
    return child.stdout.trim();
  };
  /** @param {string} name @param {string} binary @param {string} version @param {string} sourceRoot */
  const observeRuntime = (name, binary, version, sourceRoot) => {
    /** @type {Record<string,unknown>} */
    const observations = {};
    for (const terminal of [false, true]) {
      const mode = terminal ? "pty" : "pipe";
      const file = join(output, `${name}-${mode}.ts`);
      writeFileSync(
        file,
        runtimeObservationSource(sourceRoot, version, terminal),
      );
      const stdout = terminal
        ? run(
            `${name}-${mode}`,
            "python3",
            [
              join(root, "scripts/publisher/observe-pty.py"),
              "--publisher-rehearsal",
              binary,
              file,
            ],
            output,
          )
        : run(
            `${name}-${mode}`,
            binary,
            ["run", "--cached-only", "--deny-net", "--allow-env", file],
            output,
          );
      const result = JSON.parse(stdout);
      assert.equal(result.runtime, "deno");
      assert.equal(result.version, version);
      assert.equal(result.terminal, terminal);
      observations[mode] = result;
    }
    return observations;
  };
  /** @type {ReturnType<typeof createJsrStage> | undefined} */ let state;
  /** @type {Record<string,unknown>} */ const summary = {
    status: "incomplete",
    publisherOnly: true,
    noPublication: true,
    root,
    version: options["--version"],
    sourceBefore,
    commands,
  };
  const save = () =>
    writeFileSync(
      join(output, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
  try {
    assert.equal(run("bun-version", options["--bun"], ["--version"]), "1.4.3");
    run("versioned-build", options["--bun"], [
      "scripts/fix_versions.ts",
      "--version",
      options["--version"],
      "--out-dir",
      join(output, "npm"),
    ]);
    for (const name of ["package.json", "esm/deno.json", "script/deno.json"])
      assert.equal(
        JSON.parse(readFileSync(join(output, "npm", name), "utf8")).version,
        options["--version"],
      );
    const npm = join(
      dirname(createRequire(import.meta.url).resolve("npm/package.json")),
      "bin/npm-cli.js",
    );
    const packed = JSON.parse(
      run(
        "offline-pack",
        process.execPath,
        [
          npm,
          ...npmConfig,
          "pack",
          "--offline",
          "--json",
          "--pack-destination",
          output,
        ],
        join(output, "npm"),
      ),
    );
    assert.equal(packed.length, 1);
    summary.npm = {
      sha256: hashFile(join(output, packed[0].filename)),
      ...packed[0],
    };
    const artifact = join(output, "installed-consumer");
    mkdirSync(artifact);
    writeFileSync(
      join(artifact, "package.json"),
      '{"private":true,"type":"module"}\n',
    );
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    // Registry acquisition is separate from every guarded artifact/CLI consumer command.
    run(
      "artifact-registry-acquire",
      process.execPath,
      [
        npm,
        ...npmConfig,
        "install",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        join(output, packed[0].filename),
        ...Object.entries(manifest.dependencies).map(
          ([name, version]) => `${name}@${version}`,
        ),
        `@types/node@${manifest.devDependencies["@types/node"]}`,
      ],
      artifact,
    );
    const installed = join(artifact, "node_modules/yahoo-finance2");
    const installedManifest = JSON.parse(
      readFileSync(join(installed, "package.json"), "utf8"),
    );
    assert.equal(installedManifest.version, options["--version"]);
    assert.deepEqual(
      installedManifest.dependencies,
      JSON.parse(readFileSync(join(output, "npm/package.json"), "utf8"))
        .dependencies,
    );
    const guard = join(root, "scripts/testing/offline.py");
    const preload = join(output, "deny-fetch.mjs");
    writeFileSync(
      preload,
      'globalThis.fetch=()=>Promise.reject(new Error("Publisher artifact ordinary fetch forbidden"));\n',
    );
    const probe = join(artifact, "package-consumer.mjs");
    copyFileSync(join(root, "tests/package/package-consumer.mjs"), probe);
    /** @type {Array<[string,string,string[]]>} */
    const runtimeRows = [
      ["node24", process.execPath, ["--import", preload]],
      ["bun", options["--bun"], ["--preload", preload]],
    ];
    for (const [kind, runtime, prefix] of runtimeRows) {
      run(`artifact-${kind}-exports`, "python3", [
        guard,
        root,
        output,
        "--",
        runtime,
        ...prefix,
        probe,
      ]);
      for (const [name, target] of Object.entries(installedManifest.bin))
        assert.equal(
          run(`artifact-${kind}-${name}-version`, "python3", [
            guard,
            root,
            output,
            "--",
            runtime,
            ...prefix,
            join(installed, String(target)),
            "--version",
          ]),
          options["--version"],
        );
    }
    writeFileSync(
      join(artifact, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2023",
          types: ["node"],
        },
        files: ["consumer.mts", "consumer.cts"],
      }),
    );
    run("artifact-public-types", "python3", [
      guard,
      root,
      output,
      "--",
      process.execPath,
      createRequire(import.meta.url).resolve("typescript/bin/tsc"),
      "--project",
      join(artifact, "tsconfig.json"),
    ]);
    summary.installedArtifact = {
      version: installedManifest.version,
      exports: Object.keys(installedManifest.exports).length,
      formats: ["ESM", "CommonJS"],
      runtimes: ["Node24", "Bun1.4.3"],
      bins: Object.keys(installedManifest.bin),
      types: "real ESM/CommonJS consumer declarations",
      registryAcquisition:
        "normal hooks, exact root-derived runtime pins plus authoritative Node ambient pin; distinct from guarded consumers",
    };
    state = createJsrStage(root, output);
    verifyStage(state);
    summary.jsr = {
      stage: state.stage,
      head: state.head,
      sourceHashes: state.sourceHashes,
      exportCount: Object.keys(state.metadata.exports).length,
    };
    assertPublisherTemporaryPath(tmpdir());
    const config = { cwd: state.stage, allowDirty: true };
    const parsed = await parseConfig(config);
    assert.equal(
      parsed.publish.pkgJsonPath,
      null,
      "JSR verification must not inherit Node no-check compatibility flags",
    );
    summary.jsrPlugin = {
      cwd: parsed.cwd,
      pkgJsonPath: parsed.publish.pkgJsonPath,
      publishArgs: parsed.publish.publishArgs,
    };
    save();
    // Only this explicitly selected publisher process may execute upstream's Deno.
    const beforeEnv = { ...process.env };
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, env);
    try {
      const logger = {
        log: console.log,
        info: console.info,
        error: console.error,
        success: console.log,
        warn: console.warn,
      };
      await verifyConditions(
        config,
        /** @type {import('semantic-release').VerifyConditionsContext} */ ({
          cwd: root,
          logger,
        }),
      );
      const publisherRuntime = acquirePublisherLock(state);
      summary.publisherRuntime = publisherRuntime;
      summary.publisherRuntimeObservations = observeRuntime(
        "publisher-runtime",
        publisherRuntime.binary,
        publisherRuntime.version,
        state.stage,
      );
      freezePublisherLock(state);
      const lock = join(state.stage, "deno.lock");
      assert(
        lstatSync(lock).isFile(),
        "Publisher must retain its own resolution lock",
      );
      summary.publisherLockBeforeVersion = hashFile(lock);
      await prepare(
        config,
        /** @type {import('semantic-release').PrepareContext} */ ({
          cwd: root,
          logger,
          nextRelease: { version: options["--version"] },
        }),
      );
      state.metadata.version = options["--version"];
      verifyStage(state);
      await verifyConditions(
        config,
        /** @type {import('semantic-release').VerifyConditionsContext} */ ({
          cwd: root,
          logger,
        }),
      );
      assert.equal(
        hashFile(lock),
        summary.publisherLockBeforeVersion,
        "Frozen publisher graph changed",
      );
      const lockedBytes = readFileSync(lock);
      try {
        const damaged = JSON.parse(lockedBytes.toString("utf8"));
        delete damaged.specifiers[state.metadata.imports.zod];
        writeFileSync(lock, `${JSON.stringify(damaged, null, 2)}\n`);
        const binary = publisherRuntime.binary;
        run(
          "publisher-frozen-lock-negative",
          binary,
          ["publish", "--allow-dirty", "--dry-run"],
          state.stage,
          1,
        );
        assert.match(
          readFileSync(
            join(output, "publisher-frozen-lock-negative.stderr"),
            "utf8",
          ),
          /lockfile|frozen/i,
        );
        summary.frozenLockNegative =
          "altered direct specifier refused by actual pinned publisher";
      } finally {
        writeFileSync(lock, lockedBytes);
      }
      summary.jsrDryRun =
        "passed; upstream verifyConditions always appends --dry-run; no publish lifecycle invoked";
      /** @type {Array<object>} */
      const consumerFailures = [];
      /** @param {string} label @param {string} deno @param {string} denoVersion */
      const verifyConsumers = (label, deno, denoVersion) => {
        assert(state);
        const exports = state.metadata.exports;
        const directory = join(output, `${label}-consumers`);
        mkdirSync(directory);
        const source = join(directory, "source");
        mkdirSync(source);
        const lib = [
          "deno.ns",
          "dom",
          "dom.iterable",
          "dom.asynciterable",
          "esnext",
        ];
        writeFileSync(
          join(source, "deno.json"),
          JSON.stringify(
            {
              imports: state.metadata.imports,
              nodeModulesDir: "auto",
              compilerOptions: { lib },
            },
            null,
            2,
          ),
        );
        // Same actual installed graph for both runtime versions; no type-only substitute.
        writeFileSync(
          join(artifact, "deno.json"),
          JSON.stringify(
            { nodeModulesDir: "manual", compilerOptions: { lib } },
            null,
            2,
          ),
        );
        for (const [kind, consumer] of [
          ["source", source],
          ["npm", artifact],
        ]) {
          env.DENO_DIR = join(output, `${label}-consumer-cache`);
          const config = join(consumer, "deno.json");
          const positiveFile = join(consumer, `${label}-consumer.ts`);
          const negativeFile = join(consumer, `${label}-invalid-sdk.ts`);
          const positive = consumerSource(
            exports,
            state.stage,
            kind === "source" ? "source" : "npm",
            options["--version"],
            denoVersion,
          );
          writeFileSync(positiveFile, positive);
          const negative = sdkNegativeSource(positive);
          writeFileSync(negativeFile, negative);
          const prefix = `${label}-${kind}`;
          /** @type {Record<string,unknown>} */
          const observation = {
            runtime: denoVersion,
            kind,
            config,
            positiveFile,
            negativeFile,
          };
          try {
            run(
              `${prefix}-acquire-types`,
              deno,
              ["check", "--config", config, positiveFile],
              consumer,
            );
            observation.positiveTypes = "passed";
          } catch (error) {
            consumerFailures.push({
              runtime: denoVersion,
              kind,
              check: "positive types",
              error: String(error),
            });
          }
          const ownLock = join(consumer, "deno.lock");
          const lockBefore = existsSync(ownLock)
            ? hashFile(ownLock)
            : undefined;
          try {
            const name = `${prefix}-invalid-sdk-types`;
            run(
              name,
              deno,
              ["check", "--config", config, negativeFile],
              consumer,
              1,
            );
            const command = commands.at(-1);
            assert(command);
            observation.negativeSdkTypes = assertSdkTypeRejection(
              {
                ...command,
                stdout: readFileSync(join(output, `${name}.stdout`), "utf8"),
                stderr: readFileSync(join(output, `${name}.stderr`), "utf8"),
              },
              negativeFile,
              negative,
            );
          } catch (error) {
            consumerFailures.push({
              runtime: denoVersion,
              kind,
              check: "SDK negative types",
              error: String(error),
            });
          }
          try {
            observation.stdout = run(
              `${prefix}-offline-consumer`,
              deno,
              [
                "run",
                "--cached-only",
                "--deny-net",
                "--allow-env",
                "--config",
                config,
                positiveFile,
              ],
              consumer,
            );
          } catch (error) {
            consumerFailures.push({
              runtime: denoVersion,
              kind,
              check: "runtime",
              error: String(error),
            });
          }
          if (lockBefore)
            assert.equal(
              hashFile(ownLock),
              lockBefore,
              "Consumer resolution changed after acquisition",
            );
          observation.lockSha256 = lockBefore;
          observation.lockFormat = existsSync(ownLock)
            ? JSON.parse(readFileSync(ownLock, "utf8")).version
            : undefined;
          summary[`${label}Deno${kind}`] = observation;
        }
      };
      verifyConsumers(
        "publisher",
        publisherRuntime.binary,
        publisherRuntime.version,
      );
      if (options["--minimum-deno"]) {
        const deno = options["--minimum-deno"];
        assert.match(
          run("minimum-deno-version", deno, ["--version"]),
          /^deno 2\.0\.0 /m,
        );
        summary.minimumDenoBinarySha256 = hashFile(deno);
        summary.minimumRuntimeObservations = observeRuntime(
          "minimum-runtime",
          deno,
          "2.0.0",
          state.stage,
        );
        verifyConsumers("minimum", deno, "2.0.0");
        summary.minimumDeno =
          "Exact Deno 2.0 source and installed npm ESM positive/SDK-negative types and controlled runtimes selected";
      } else
        summary.minimumDeno =
          "not selected; no Deno 2.0 compatibility acceptance";
      summary.consumerFailures = consumerFailures;
      assert.equal(
        consumerFailures.length,
        0,
        "Publisher consumer verification failed; independent results retained",
      );
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, beforeEnv);
      await removeTemporaryBinFolder();
    }
    summary.status = "passed";
  } catch (error) {
    summary.status = "failed";
    summary.error = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    for (const [name, expected] of Object.entries(sourceBefore))
      assert.equal(
        hashFile(join(root, name)),
        expected,
        `Publisher modified root ${name}`,
      );
    summary.sourceAfter = sourceBefore;
    save();
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
}
if (isMain()) {
  try {
    await rehearse(parseRehearsal(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
