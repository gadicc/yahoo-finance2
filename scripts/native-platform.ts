/** Actual hosted-OS proof driver. Native execution is trusted, not a sandbox. */
import assert from "node:assert/strict";
import { MIN_SUPPORTED_RUNTIMES } from "../src/lib/runtime-detect.ts";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { arch, release, type } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixtureSnapshot } from "./testing/native.ts";

const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const marker = "yahoo-finance2/native-platform-v1\n";
const sha = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

export function portableRelative(root: string, file: string): string {
  const name = relative(root, file);
  assert(
    name && !isAbsolute(name) && name !== ".." && !name.startsWith(".." + sep),
    "Path is outside its owned root",
  );
  return name.split(sep).join("/");
}

interface PathDecision {
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  sep: string;
}

/** Disjoint absolute trees may be on different Windows volumes or shares. */
export function resultsOutsideCheckout(
  checkout: string,
  results: string,
  paths: PathDecision = { relative, isAbsolute, sep },
): boolean {
  const contains = (parent: string, child: string) => {
    const name = paths.relative(parent, child);
    return (
      name === "" ||
      (!paths.isAbsolute(name) &&
        name !== ".." &&
        !name.startsWith(`..${paths.sep}`))
    );
  };
  return (
    paths.isAbsolute(checkout) &&
    paths.isAbsolute(results) &&
    !contains(checkout, results) &&
    !contains(results, checkout)
  );
}

/** Validate actual native LCOV scope without pretending this is the strict suite. */
export function validateNativeCoverage(text: string, root: string): string[] {
  const sources: string[] = [];
  let current: string | undefined;
  let lines = 0;
  let mapped = new Map<number, number>();
  let totals = new Map<string, number>();
  let named = false;
  const counter = (value: string) => {
    assert(/^\d+$/.test(value), "Malformed LCOV counter");
    const count = Number(value);
    assert(Number.isSafeInteger(count), "Unsafe LCOV counter");
    return count;
  };
  for (const raw of text.split(/\r?\n/)) {
    if (raw === "") continue;
    if (raw === "TN:") {
      assert.equal(current, undefined, "Unterminated LCOV record");
      assert(!named, "Unexpected LCOV test name");
      named = true;
    } else if (raw.startsWith("SF:")) {
      assert.equal(current, undefined, "Unterminated LCOV record");
      const source = raw.slice(3);
      const file = resolve(root, source);
      current = portableRelative(root, file);
      assert(
        source.split(sep).join("/") === current || source === file,
        "Noncanonical LCOV source",
      );
      assert(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
      assert(!/(?:^|\/)(?:node_modules|fixtures|coverage|npm)\//.test(current));
      assert(!current.endsWith(".test.ts"));
      assert(!sources.includes(current), "Duplicate LCOV source");
      const physical = readFileSync(file, "utf8").split(/\r\n|\n|\r/);
      if (physical.at(-1) === "") physical.pop();
      lines = physical.length;
      mapped = new Map();
      totals = new Map();
    } else if (raw.startsWith("DA:")) {
      assert(current, "Line counter outside LCOV record");
      assert(/^DA:[1-9]\d*,\d+$/.test(raw), "Malformed LCOV line counter");
      const [line, count] = raw.slice(3).split(",").map(counter);
      assert(line <= lines, "LCOV line exceeds physical source lines");
      assert(!mapped.has(line), "Duplicate LCOV mapped line");
      mapped.set(line, count);
    } else if (/^(?:LF|LH|FNF|FNH):/.test(raw)) {
      assert(current, "Totals outside LCOV record");
      assert(/^(?:LF|LH|FNF|FNH):\d+$/.test(raw), "Malformed LCOV total");
      const [key, value] = raw.split(":");
      assert(!totals.has(key), "Duplicate LCOV total");
      totals.set(key, counter(value));
    } else if (raw === "end_of_record") {
      assert(current, "Missing LCOV source");
      assert(mapped.size > 0, "Empty LCOV line data");
      assert(totals.size === 4, "Missing LCOV totals");
      assert.equal(totals.get("LF"), mapped.size, "Inconsistent LCOV LF");
      assert.equal(
        totals.get("LH"),
        [...mapped.values()].filter((count) => count > 0).length,
        "Inconsistent LCOV LH",
      );
      const functions = totals.get("FNF");
      const hit = totals.get("FNH");
      assert(
        functions !== undefined && hit !== undefined && hit <= functions,
        "Inconsistent LCOV functions",
      );
      sources.push(current);
      current = undefined;
      named = false;
    } else {
      assert.fail(`Unexpected LCOV field: ${raw}`);
    }
  }
  assert.equal(current, undefined, "Unterminated LCOV record");
  assert(!named, "Unterminated LCOV test name");
  assert(sources.length > 0, "Empty native coverage");
  for (const file of [
    "src/lib/runtime-detect.ts",
    "src/modules/quote.ts",
    "src/modules/chart.ts",
    "src/modules/quoteSummary-iface.ts",
  ])
    assert(sources.includes(file), `Missing native coverage source: ${file}`);
  return sources.sort();
}

interface Options {
  results: string;
  phase: string;
  node22?: string;
  node24?: string;
  npm?: string;
  minimumBun?: string;
  minimumVersion?: string;
  expectedOS?: string;
}
export function parseOptions(args: string[]): Options {
  const phase = args[0];
  assert(
    ["install", "replay", "package"].includes(phase),
    "Usage: bun scripts/native-platform.ts install|replay|package --results OUTSIDE_REPOSITORY [--node22 ABS --node24 ABS --npm ABS --minimum-bun ABS --minimum-version EXACT --expected-os PLATFORM]",
  );
  const allowed: Record<string, keyof Options> = {
    "--results": "results",
    "--node22": "node22",
    "--node24": "node24",
    "--npm": "npm",
    "--minimum-bun": "minimumBun",
    "--minimum-version": "minimumVersion",
    "--expected-os": "expectedOS",
  };
  const values: Record<string, string> = {};
  for (let index = 1; index < args.length; index++) {
    const key = allowed[args[index]];
    const value = args[++index];
    assert(
      key && value && !value.startsWith("--") && values[key] === undefined,
      "Invalid/duplicate native-platform option",
    );
    values[key] = value;
  }
  assert(
    values.results && isAbsolute(values.results),
    "Results must be an absolute outside-repository path",
  );
  if (values.expectedOS)
    assert.equal(
      values.expectedOS,
      process.platform,
      "Actual runner OS does not match its matrix row",
    );
  return { ...values, phase, results: values.results };
}

function packageInventory(
  directory: string,
  visited = new Set<string>(),
): object[] {
  if (!existsSync(directory)) return [];
  const canonical = realpathSync(directory);
  if (visited.has(canonical)) return [];
  visited.add(canonical);
  const packages: object[] = [];
  for (const name of readdirSync(directory).sort()) {
    if (name.startsWith(".")) continue;
    const scope = join(directory, name);
    const entries = name.startsWith("@")
      ? readdirSync(scope).map((part) => join(scope, part))
      : [scope];
    for (const file of entries) {
      const manifest = join(file, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      packages.push({
        location: portableRelative(repository, file),
        name: pkg.name,
        version: pkg.version,
        engines: pkg.engines,
        license: pkg.license,
        os: pkg.os,
        cpu: pkg.cpu,
        lifecycle:
          pkg.scripts &&
          Object.fromEntries(
            Object.entries(pkg.scripts).filter(([key]) =>
              /^(?:preinstall|install|postinstall)$/.test(key),
            ),
          ),
        manifestSha256: sha(manifest),
      });
      packages.push(...packageInventory(join(file, "node_modules"), visited));
    }
  }
  return packages;
}

export async function main(options: Options): Promise<void> {
  assert.equal(
    process.versions.bun,
    "1.4.3",
    "Proof driver requires development Bun 1.4.3",
  );
  const results = resolve(options.results);
  assert(
    resultsOutsideCheckout(repository, results),
    "Results must be outside the checkout without overlap",
  );
  if (!existsSync(results)) mkdirSync(results, { mode: 0o700 });
  assert(
    lstatSync(results).isDirectory() && !lstatSync(results).isSymbolicLink(),
  );
  assert.equal(realpathSync(results), results, "Results must be canonical");
  const owner = join(results, "owner.txt");
  if (!existsSync(owner)) {
    assert.equal(readdirSync(results).length, 0, "Refusing unowned results");
    writeFileSync(owner, marker, { flag: "wx", mode: 0o600 });
  }
  assert.equal(readFileSync(owner, "utf8"), marker);
  const summaryFile = join(results, "summary.json");
  const before = fixtureSnapshot(repository);
  const lock = sha(join(repository, "bun.lock"));
  const manifest = sha(join(repository, "package.json"));
  const summary = existsSync(summaryFile)
    ? JSON.parse(readFileSync(summaryFile, "utf8"))
    : {
        status: "incomplete",
        platform: process.platform,
        arch: arch(),
        osType: type(),
        osRelease: release(),
        bun: process.versions.bun,
        github: {
          sha: process.env.GITHUB_SHA,
          runId: process.env.GITHUB_RUN_ID,
          attempt: process.env.GITHUB_RUN_ATTEMPT,
          runnerOS: process.env.RUNNER_OS,
          runnerArch: process.env.RUNNER_ARCH,
          imageOS: process.env.ImageOS,
          imageVersion: process.env.ImageVersion,
        },
        fixtureBefore: before,
        lockSha256: lock,
        manifestSha256: manifest,
        phases: {},
        commands: [],
        policy:
          "Trusted native replay; no raw-socket or arbitrary-filesystem denial. Registry installs are separate from replay/probes. Strict Linux CI is unchanged.",
      };
  assert.equal(summary.platform, process.platform);
  assert.equal(summary.fixtureBefore, before);
  assert.equal(summary.lockSha256, lock);
  assert.equal(summary.manifestSha256, manifest);
  const save = () =>
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + "\n");
  const inheritedPath =
    Object.entries(process.env).find(
      ([key]) => key.toUpperCase() === "PATH",
    )?.[1] ?? "";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: dirname(process.execPath) + delimiter + inheritedPath,
  };
  for (const name of Object.keys(env))
    if (/^(?:FETCH_DEVEL|FMC_|NODE_OPTIONS$|BUN_OPTIONS$|PATH$)/i.test(name))
      delete env[name];
  env.PATH = dirname(process.execPath) + delimiter + inheritedPath;
  function command(
    name: string,
    executable: string,
    args: string[],
    cwd = repository,
    timeout = 600000,
    expected = 0,
  ) {
    assert(/^[a-z0-9-]+$/.test(name));
    const started = new Date().toISOString();
    const child = spawnSync(executable, args, {
      cwd,
      env,
      encoding: "utf8",
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(join(results, name + ".stdout"), child.stdout ?? "");
    writeFileSync(join(results, name + ".stderr"), child.stderr ?? "");
    summary.commands.push({
      name,
      executable,
      args,
      cwd,
      started,
      finished: new Date().toISOString(),
      code: child.status,
      signal: child.signal,
      error: child.error?.message,
    });
    save();
    assert.ifError(child.error);
    assert.equal(
      child.status,
      expected,
      `${name} failed; inspect retained stdout/stderr`,
    );
    console.log(`${name}: ${child.status}`);
    return child.stdout;
  }
  try {
    if (options.phase === "install") {
      assert(
        !existsSync(join(repository, "node_modules")),
        "Clean-install proof requires absent node_modules",
      );
      env.BUN_INSTALL_CACHE_DIR = join(results, "fresh-bun-cache");
      command("toolchain-before", process.execPath, ["run", "check:toolchain"]);
      command("frozen-install", process.execPath, [
        "install",
        "--frozen-lockfile",
      ]);
      const hookLog =
        readFileSync(join(results, "frozen-install.stderr"), "utf8") +
        readFileSync(join(results, "frozen-install.stdout"), "utf8");
      assert(
        hookLog.includes("bun scripts/check-toolchain.mjs") &&
          hookLog.includes("Toolchain OK"),
        "Root preinstall must actually execute",
      );
      assert.equal(
        command("local-biome", process.execPath, [
          "node_modules/@biomejs/biome/bin/biome",
          "--version",
        ]).trim(),
        "Version: 2.5.15",
      );
      const installed = packageInventory(join(repository, "node_modules"));
      writeFileSync(
        join(results, "installed-packages.json"),
        JSON.stringify(
          {
            packages: installed,
            inventoryEntries: installed.length,
            note: "Actual manifest inventory, distinct from Bun's reported install count; optional/native packages retained as observed.",
          },
          null,
          2,
        ) + "\n",
      );
    } else if (options.phase === "replay") {
      assert.equal(
        summary.phases.install,
        "passed",
        "Clean install must pass first",
      );
      const listed = command("native-inventory", process.execPath, [
        "run",
        "test:native",
        "--list",
      ]);
      summary.nativeInventory = listed.trim().split(/\r?\n/);
      assert(
        summary.nativeInventory.length > 0 &&
          summary.nativeInventory.every((name: string) =>
            name.endsWith(".test.ts"),
          ),
      );
      summary.nativeRuns = {};
      command("portable-helper-controls", process.execPath, [
        "test",
        "--preload",
        join(repository, "scripts/testing/native-platform-preload.mjs"),
        "scripts/native-platform.test.ts",
        "scripts/native-platform-frames.test.ts",
      ]);
      for (const [name, flags] of [
        ["native-full", []],
        ["native-serial", ["--serial"]],
        ["native-coverage", ["--coverage"]],
      ] as const) {
        const output = command(name, process.execPath, [
          "run",
          "test:native",
          ...flags,
          "--timeout=30000",
          "--run-timeout=300000",
        ]);
        const stderr = readFileSync(join(results, name + ".stderr"), "utf8");
        const report = output + stderr;
        const passes = Number(report.match(/\b(\d+) pass\b/)?.[1]);
        const skips = Number(report.match(/\b(\d+) skip\b/)?.[1] ?? 0);
        const files = Number(report.match(/across (\d+) files?/)?.[1]);
        assert(
          passes > 0 &&
            /\b0 fail\b/.test(report) &&
            skips === 0 &&
            files === summary.nativeInventory.length,
          "Native run must pass every inventoried file without skips",
        );
        summary.nativeRuns[name] = { passes, failures: 0, skips, files };
      }
      const lcov = readFileSync(join(repository, "coverage/lcov.info"), "utf8");
      summary.nativeCoverage = {
        sources: validateNativeCoverage(lcov, repository),
        sha256: sha(join(repository, "coverage/lcov.info")),
        scope:
          "Native library/portable inventory only; no strict full-suite equivalence",
      };
      copyFileSync(
        join(repository, "coverage/lcov.info"),
        join(results, "native-lcov.info"),
      );
      command(
        "actual-process-controls",
        process.execPath,
        ["scripts/native-platform-process.ts", results],
        repository,
        60000,
      );
    } else {
      assert.equal(
        summary.phases.replay,
        "passed",
        "Native replay must pass before packaging",
      );
      const { node22, node24, npm, minimumBun, minimumVersion } = options;
      assert(
        node22 && node24 && npm && minimumBun && minimumVersion,
        "Explicit Node22/24/npm/minimum-Bun inputs required",
      );
      for (const file of [node22, node24, npm, minimumBun])
        assert(
          isAbsolute(file) && lstatSync(file).isFile(),
          "Runtime inputs must be real absolute files",
        );
      assert.equal(
        command("node22-version", node22, ["--version"]).trim(),
        "v22.0.0",
      );
      assert.equal(
        command("node24-version", node24, ["--version"]).trim(),
        "v24.21.0",
      );
      assert.equal(minimumVersion, MIN_SUPPORTED_RUNTIMES.bun);
      assert.equal(
        command("minimum-bun-version", minimumBun, ["--version"]).trim(),
        minimumVersion,
      );
      const built = join(results, "built-package");
      command("build", process.execPath, [
        "scripts/build_npm.ts",
        "--out-dir",
        built,
      ]);
      const packs = join(results, "packs");
      mkdirSync(packs);
      const packed = JSON.parse(
        command(
          "pack",
          node24,
          [
            npm,
            "pack",
            built,
            "--offline",
            "--json",
            "--pack-destination",
            packs,
            "--cache",
            join(results, "pack-cache"),
          ],
          results,
        ),
      )[0];
      assert(
        packed.filename === basename(packed.filename) &&
          packed.filename.endsWith(".tgz"),
      );
      const tarball = join(packs, packed.filename);
      summary.package = {
        filename: packed.filename,
        sha256: sha(tarball),
        entryCount: packed.entryCount,
      };
      const consumer = join(results, "consumer with spaces");
      mkdirSync(consumer);
      writeFileSync(
        join(consumer, "package.json"),
        '{"private":true,"type":"module"}\n',
      );
      command(
        "consumer-registry-install",
        node24,
        [
          npm,
          "install",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          "--cache",
          join(results, "consumer-npm-cache"),
          tarball,
          "typescript@6.0.3",
          "@types/node@24.10.1",
        ],
        consumer,
      );
      for (const name of [
        "package-consumer.mjs",
        "package-runtime.mjs",
        "package-native-cli.mjs",
        "package-cookie-probe.mjs",
        "package-cookie-fetch.mjs",
        "native-mcp-frames.mjs",
        "native-mcp-fragment.mjs",
      ])
        copyFileSync(
          join(repository, "tests/migration", name),
          join(consumer, name),
        );
      const preload = join(
        repository,
        "scripts/testing/native-platform-preload.mjs",
      );
      for (const [name, executable, bun] of [
        ["node22", node22, false],
        ["node24", node24, false],
        ["bun", process.execPath, true],
        ["minimum-bun", minimumBun, true],
      ] as const) {
        const prefix = bun
          ? ["--preload", preload]
          : ["--import", pathToFileURL(preload).href];
        command(
          name + "-consumer",
          executable,
          [...prefix, "package-consumer.mjs"],
          consumer,
        );
        command(
          name + "-runtime",
          executable,
          [...prefix, "package-runtime.mjs", "pipe"],
          consumer,
        );
        command(
          name + "-cli",
          executable,
          [
            ...prefix,
            "package-native-cli.mjs",
            executable,
            node24,
            npm,
            process.execPath,
            preload,
            bun ? "bun" : "node",
            "full",
          ],
          consumer,
          120000,
        );
      }
      command(
        "node24-cli-fragmented",
        node24,
        [
          "--import",
          pathToFileURL(preload).href,
          "--import",
          pathToFileURL(join(consumer, "native-mcp-fragment.mjs")).href,
          "package-native-cli.mjs",
          node24,
          node24,
          npm,
          process.execPath,
          preload,
          "node",
          "full",
        ],
        consumer,
        120000,
      );
      command(
        "consumer-types",
        node24,
        [
          join(consumer, "node_modules/typescript/bin/tsc"),
          "--noEmit",
          "--strict",
          "--skipLibCheck",
          "--target",
          "es2022",
          "--module",
          "nodenext",
          "--moduleResolution",
          "nodenext",
          "consumer.mts",
          "consumer.cts",
        ],
        consumer,
      );
      summary.minimumRuntime = {
        version: MIN_SUPPORTED_RUNTIMES.bun,
        platforms: "Linux/macOS/Windows upstream-supported combinations",
        cliScope: "full",
      };
    }
    summary.phases[options.phase] = "passed";
    summary.status =
      summary.phases.install === "passed" &&
      summary.phases.replay === "passed" &&
      summary.phases.package === "passed"
        ? "passed"
        : "incomplete";
  } catch (error) {
    summary.phases[options.phase] = "failed";
    summary.status = "failed";
    summary.failure = String(error);
    throw error;
  } finally {
    summary.fixtureAfter = fixtureSnapshot(repository);
    summary.fixtureBytesUnchanged = summary.fixtureAfter === before;
    summary.lockUnchanged = sha(join(repository, "bun.lock")) === lock;
    summary.manifestUnchanged =
      sha(join(repository, "package.json")) === manifest;
    if (
      !summary.fixtureBytesUnchanged ||
      !summary.lockUnchanged ||
      !summary.manifestUnchanged
    )
      summary.status = "failed";
    save();
    assert(
      summary.fixtureBytesUnchanged &&
        summary.lockUnchanged &&
        summary.manifestUnchanged,
      "Fixtures or frozen metadata changed; inspect without automatic rollback",
    );
  }
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(parseOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
