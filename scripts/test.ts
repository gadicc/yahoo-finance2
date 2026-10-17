import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  type Dirent,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { constants, tmpdir } from "node:os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  excludedDirectories,
  inventory,
  nativeInventory,
  libraryInventory,
  testBatches,
  select,
} from "./testing/inventory.ts";
import {
  assertFixtureSnapshot,
  fixtureSnapshot,
  nativeEnvironment,
  waitNativeChild,
} from "./testing/native.ts";

const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const guard = fileURLToPath(new URL("./testing/offline.py", import.meta.url));
const help = `Usage: bun scripts/test.ts [OPTIONS] [TEST FILE OR DIRECTORY ...]
Default: offline library replay, isolated files, four workers; test bodies remain serial.
  --full                   Complete library and tooling inventory (CI)
  --native                 Trusted portable library replay; no OS sandbox (explicit opt-in)
  --serial                 Isolated serial files
  --filter TEXT            Select test paths containing TEXT
  --name REGEX, -t REGEX    Select test names matching REGEX
  --watch                  Restart the selected mode after source/test content changes
  --coverage               Write native Bun coverage to coverage/
  --timeout MS             Per-test timeout (default 5000)
  --run-timeout MS         Whole-run timeout (default 120000)
  --list                   Print the selected file inventory without execution
  --help                   Show this help
Paths are repository-relative or absolute. Unknown options and empty selections fail.
Linux requires Bubblewrap, Python 3 and libseccomp; there is no unguarded fallback.
`;

export interface TestOptions {
  paths: string[];
  native: boolean;
  full: boolean;
  serial: boolean;
  watch: boolean;
  coverage: boolean;
  list: boolean;
  help: boolean;
  filter?: string;
  name?: string;
  timeout: number;
  runTimeout: number;
}

export function parseArguments(args: string[]): TestOptions {
  const options: TestOptions = {
    paths: [],
    native: false,
    full: false,
    serial: false,
    watch: false,
    coverage: false,
    list: false,
    help: false,
    timeout: 5000,
    runTimeout: 120000,
  };
  let positional = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--") {
      positional = true;
      continue;
    }
    if (positional || !argument.startsWith("-")) {
      options.paths.push(argument);
      continue;
    }
    const [flag, ...suffix] = argument.split("=");
    const boolean = {
      "--native": "native",
      "--full": "full",
      "--serial": "serial",
      "--watch": "watch",
      "--coverage": "coverage",
      "--list": "list",
      "--help": "help",
    } as const;
    if (flag in boolean) {
      if (suffix.length) throw new Error(`${flag} does not accept a value`);
      options[boolean[flag as keyof typeof boolean]] = true;
      continue;
    }
    if (
      ![
        "--filter",
        "--name",
        "-t",
        "--test-name-pattern",
        "--timeout",
        "--run-timeout",
      ].includes(flag)
    ) {
      throw new Error(`Unknown test option: ${argument}`);
    }
    const value = suffix.length ? suffix.join("=") : args[++index];
    if (
      value === undefined ||
      !value.length ||
      (!suffix.length && value.startsWith("--"))
    ) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (flag === "--filter") options.filter = value;
    else if (["--name", "-t", "--test-name-pattern"].includes(flag)) {
      new RegExp(value); // Reject malformed expressions before spawning a child.
      options.name = value;
    } else {
      if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
        throw new Error(
          `${flag} must be a positive integer no larger than 2147483647`,
        );
      }
      if (flag === "--timeout") options.timeout = Number(value);
      else options.runTimeout = Number(value);
    }
  }
  return options;
}

/** Content-based watch fingerprint also detects added/removed directories. */
export function fingerprint(
  root: string,
  readContents: (path: string) => Uint8Array = (path) => readFileSync(path),
): string {
  const hash = createHash("sha256");
  function hashFile(path: string) {
    try {
      const contents = readContents(path);
      hash.update(path);
      hash.update("\0");
      hash.update(String(contents.length));
      hash.update("\0");
      hash.update(contents);
    } catch (error) {
      if (
        !["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
  }

  function visit(directory: string) {
    let entries: Dirent<string>[];
    try {
      if (lstatSync(directory).isSymbolicLink()) return;
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (
        ["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        return;
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || excludedDirectories.has(entry.name)) {
        continue;
      }
      const path = join(directory, entry.name);
      if (path === join(root, "tests", "cloudflare")) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) {
        hashFile(path);
      }
    }
  }
  for (const directory of ["src", "tests", "scripts", "bin"]) {
    visit(join(root, directory));
  }
  const rootInputs = readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(?:json|jsonc|toml|[cm]?[jt]sx?)$/.test(entry.name),
    )
    .map((entry) => entry.name);
  // Includes current root TypeScript extends chains, Bun/Deno metadata and
  // runtime/release policies; nested configs and executable code are scanned.
  for (const file of [
    ...new Set([
      "package.json",
      "bun.lock",
      "deno.lock",
      ".bun-version",
      "bunfig.toml",
      ...rootInputs,
    ]),
  ].sort()) {
    hashFile(join(root, file));
  }
  return hash.digest("hex");
}

function prepareCoverage(root: string) {
  const output = join(root, "coverage");
  mkdirSync(output, { recursive: true });
  if (
    lstatSync(output).isSymbolicLink() ||
    relative(realpathSync(output), output) !== ""
  ) {
    throw new Error("coverage must be a real repository directory");
  }
  // Clear before selection too: an empty/invalid selection must not expose
  // another run's metrics. Unlink affects only this entry, not its link target.
  rmSync(join(output, "lcov.info"), { force: true });
}

function signalCode(signal: NodeJS.Signals) {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 128 + (constants.signals[signal] ?? 1);
}

interface BatchResult {
  code: number;
  leaves: number;
  coverage?: string;
}

async function runBatch(
  root: string,
  files: string[],
  options: TestOptions,
  abort: AbortSignal,
  scratch: string,
  profile: "strict" | "ipc",
  remaining: () => number,
): Promise<BatchResult> {
  const report = join(scratch, "junit.xml");
  const command = [
    process.execPath,
    "test",
    "--no-env-file",
    "--no-orphans",
    ...(options.native
      ? [
          "--preload",
          fileURLToPath(
            new URL("./testing/native-preload.ts", import.meta.url),
          ),
        ]
      : []),
    options.serial ? "--isolate" : "--parallel=4",
    `--timeout=${options.timeout}`,
    "--reporter=junit",
    `--reporter-outfile=${report}`,
    ...(options.name === undefined
      ? []
      : [`--test-name-pattern=${options.name}`]),
    ...(options.coverage
      ? [
          "--coverage",
          `--coverage-dir=${join(scratch, "coverage")}`,
          "--coverage-reporter=text",
          "--coverage-reporter=lcov",
        ]
      : []),
    ...files.map((file) => resolve(root, file)),
  ];
  const environment = {
    ...process.env,
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
  };
  const child = spawn(
    options.native ? command[0] : "python3",
    options.native
      ? command.slice(1)
      : [guard, "--profile", profile, root, scratch, "--", ...command],
    {
      cwd: root,
      env: options.native
        ? nativeEnvironment(environment, scratch)
        : environment,
      stdio: ["inherit", "inherit", "pipe"],
      detached: !options.native || process.platform !== "win32",
      windowsHide: options.native,
    },
  );
  let diagnostic = "";
  let truncated = false;
  if (!child.stderr) throw new Error("Batch stderr pipe is required");
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    if (diagnostic.length + chunk.length > 65536) truncated = true;
    if (!truncated) diagnostic += chunk.toString("utf8");
  });
  const result = await waitNativeChild(child, abort, Math.max(1, remaining()));
  if (result.timeout) return { code: 124, leaves: 0 };
  if (abort.aborted) return { code: result.code || 130, leaves: 0 };
  const filteredEmpty =
    result.code === 1 &&
    options.name !== undefined &&
    !truncated &&
    /^error: regex .* matched 0 tests\. Searched \d+ files? \(skipping \d+ tests?\)/m.test(
      diagnostic,
    ) &&
    !diagnostic.includes("Unhandled error between tests");
  if (result.code !== 0 && !filteredEmpty)
    return { code: result.code, leaves: 0 };
  if (!lstatSync(report).isFile() || realpathSync(report) !== report)
    throw new Error("Fresh regular JUnit report is required for every batch");
  const xml = readFileSync(report, "utf8");
  if (!/<testsuites?\b/.test(xml))
    throw new Error("Malformed JUnit batch report");
  const cases = [
    ...xml.matchAll(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g),
  ];
  const leaves = cases.filter((match) => !/<skipped\b/.test(match[0])).length;
  if ((filteredEmpty && leaves !== 0) || /<(?:failure|error)\b/.test(xml))
    return { code: 1, leaves };
  if (
    options.name === undefined &&
    cases.some((match) => /<skipped\b/.test(match[0]))
  ) {
    console.error("Skipped tests are not accepted by unfiltered replay");
    return { code: 1, leaves };
  }
  const coverage = join(scratch, "coverage", "lcov.info");
  if (!options.coverage) return { code: 0, leaves };
  try {
    if (!lstatSync(coverage).isFile() || realpathSync(coverage) !== coverage)
      throw new Error("Coverage output must be a regular file");
    return { code: 0, leaves, coverage };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { code: 0, leaves };
  }
}

async function runOnce(
  root: string,
  files: string[],
  options: TestOptions,
  abort: AbortSignal,
): Promise<number> {
  const temporary = realpathSync(tmpdir());
  const temporaryRelative = relative(root, temporary);
  if (
    temporaryRelative === "" ||
    (!isAbsolute(temporaryRelative) &&
      temporaryRelative !== ".." &&
      !temporaryRelative.startsWith(`..${sep}`))
  )
    throw new Error("TMPDIR must be outside the repository and fixtures");
  const scratch = realpathSync(mkdtempSync(join(temporary, "yf-replay-")));
  const deadline = performance.now() + options.runTimeout;
  const remaining = () => Math.max(0, Math.ceil(deadline - performance.now()));
  const controller = new AbortController();
  let timedOut = false;
  const stop = () => controller.abort(abort.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort("timeout");
  }, options.runTimeout);
  abort.addEventListener("abort", stop, { once: true });
  if (abort.aborted) stop();
  const active = () => {
    if (!remaining()) {
      timedOut = true;
      controller.abort("timeout");
    }
    return !controller.signal.aborted;
  };
  let before: string | undefined;
  let published = false;
  let succeeded = false;
  const execute = async (): Promise<number> => {
    if (options.native) before = fixtureSnapshot(root);
    const batches = options.native
      ? [{ profile: "strict" as const, files }]
      : testBatches(files);
    const reports: string[] = [];
    let leaves = 0;
    for (const batch of batches) {
      if (!active()) return timedOut ? 124 : 130;
      console.error(`Batch ${batch.profile}: ${batch.files.length} files`);
      const current = realpathSync(mkdtempSync(join(scratch, "batch-")));
      const result = await runBatch(
        root,
        batch.files,
        options,
        controller.signal,
        current,
        batch.profile,
        remaining,
      );
      if (!active()) return timedOut ? 124 : 130;
      if (result.code !== 0) {
        timedOut ||= result.code === 124;
        return result.code;
      }
      leaves += result.leaves;
      if (result.coverage) reports.push(result.coverage);
    }
    if (!leaves) {
      console.error(
        "No tests executed (empty file or unmatched test-name filter)",
      );
      return 2;
    }
    if (before !== undefined) assertFixtureSnapshot(root, before);
    if (options.coverage) {
      if (reports.length) {
        const merged = join(scratch, "merged-lcov.info");
        if (options.native)
          writeFileSync(merged, readFileSync(reports[0]), { flag: "wx" });
        else {
          const merge = spawn(
            "python3",
            [
              fileURLToPath(new URL("./ci.py", import.meta.url)),
              "merge-coverage",
              root,
              merged,
              ...reports,
            ],
            {
              cwd: root,
              stdio: "inherit",
              detached: true,
            },
          );
          const result = await waitNativeChild(
            merge,
            controller.signal,
            Math.max(1, remaining()),
          );
          if (!active()) return timedOut ? 124 : 130;
          if (result.timeout || result.code !== 0) {
            timedOut ||= result.timeout;
            return result.timeout ? 124 : result.code;
          }
        }
        if (!active()) return timedOut ? 124 : 130;
        const staging = mkdtempSync(join(root, "coverage", ".lcov-"));
        try {
          const output = join(staging, "lcov.info");
          writeFileSync(output, readFileSync(merged), { flag: "wx" });
          if (!active()) return timedOut ? 124 : 130;
          renameSync(output, join(root, "coverage", "lcov.info"));
          published = true;
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      } else
        console.error(
          "No instrumented source coverage generated for this selection",
        );
    }
    if (!active()) return timedOut ? 124 : 130;
    succeeded = true;
    return 0;
  };
  let result: number;
  try {
    result = await execute();
  } finally {
    clearTimeout(timer);
    abort.removeEventListener("abort", stop);
    let verified = false;
    let cleaned = false;
    try {
      if (before !== undefined) assertFixtureSnapshot(root, before);
      verified = true;
    } finally {
      try {
        rmSync(scratch, { recursive: true, force: true });
        cleaned = true;
      } finally {
        if (published && (!verified || !cleaned || !succeeded || !active()))
          rmSync(join(root, "coverage", "lcov.info"), { force: true });
      }
    }
    if (timedOut)
      console.error(`Test run timed out after ${options.runTimeout}ms`);
  }
  if (!active()) {
    if (published) rmSync(join(root, "coverage", "lcov.info"), { force: true });
    return timedOut ? 124 : 130;
  }
  return result;
}

/** root is an explicit test seam; the public CLI always uses this repository. */
export async function runTests(
  options: TestOptions,
  root = repository,
  signal?: AbortSignal,
): Promise<number> {
  root = realpathSync(root);
  if (options.help) {
    console.log(help);
    return 0;
  }
  if (options.native && options.full)
    throw new Error(
      "--full requires strict Linux replay; native scope stays explicit",
    );
  const pin = readFileSync(join(repository, ".bun-version"), "utf8").trim();
  if (process.versions.bun !== pin) {
    throw new Error(`Tests require Bun ${pin}; select the pinned binary`);
  }
  if (!options.native && !options.list && process.platform !== "linux") {
    throw new Error(
      "Offline replay requires Linux with Bubblewrap/Python/libseccomp. Use Linux or WSL; no unguarded fallback is available.",
    );
  }
  let previous = options.watch ? fingerprint(root) : "";
  while (!signal?.aborted) {
    const currentPin = readFileSync(
      join(repository, ".bun-version"),
      "utf8",
    ).trim();
    if (process.versions.bun !== currentPin) {
      throw new Error(
        `Tests require Bun ${currentPin}; restart with the pinned binary`,
      );
    }
    if (options.coverage && !options.list) prepareCoverage(root);
    const discovered = inventory(root);
    const allowed = options.native
      ? nativeInventory(discovered)
      : options.full || options.paths.length
        ? discovered
        : libraryInventory(discovered);
    if (options.native) {
      const included = new Set(allowed);
      const omitted = discovered.filter((file) => !included.has(file));
      console.error(
        `Native trusted replay: no OS sandbox; omitted ${omitted.length} tooling files outside the library/portable-control scope:\n${omitted.join("\n")}`,
      );
      if (options.paths.length) {
        const outside = select(root, discovered, options.paths).filter(
          (file) => !included.has(file),
        );
        if (outside.length)
          throw new Error(
            `Native selection is outside its portable scope: ${outside.join(", ")}; use strict Linux replay`,
          );
      }
    }
    const files = select(root, allowed, options.paths, options.filter);
    if (options.list) {
      for (const file of files) console.log(file);
      return 0;
    }
    console.error(
      `${options.native ? "Native replay" : "Replay"}: ${files.length} files; ${
        options.serial ? "isolated serial" : "4 isolated workers"
      }`,
    );
    const run = new AbortController();
    const stop = () => run.abort(signal?.reason);
    signal?.addEventListener("abort", stop, { once: true });
    let changed = false;
    let watchError: unknown;
    const poll = options.watch
      ? setInterval(() => {
          try {
            const current = fingerprint(root);
            if (current !== previous) {
              previous = current;
              changed = true;
              run.abort("changed");
            }
          } catch (error) {
            watchError = error;
            run.abort("watch error");
          }
        }, 200)
      : undefined;
    let code: number;
    try {
      code = await runOnce(root, files, options, run.signal);
      if (!options.watch || signal?.aborted) return code;
      console.error(
        options.native
          ? "Watch: waiting for source/test content changes (fresh native replay restart)"
          : "Watch: waiting for source/test content changes (fresh guarded restart)",
      );
      while (!changed && !signal?.aborted && !watchError) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      if (watchError) throw watchError;
    } finally {
      if (poll) clearInterval(poll);
      signal?.removeEventListener("abort", stop);
    }
    if (signal?.aborted) {
      return typeof signal.reason === "string"
        ? signalCode(signal.reason as NodeJS.Signals)
        : 130;
    }
    console.error("Watch: restarting and rediscovering tests");
  }
  return 130;
}

export async function main(
  args = process.argv.slice(2),
  root = repository,
): Promise<number> {
  const controller = new AbortController();
  const interrupt = () => controller.abort("SIGINT");
  const terminate = () => controller.abort("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const code = await runTests(parseArguments(args), root, controller.signal);
    return controller.signal.aborted
      ? signalCode(controller.signal.reason)
      : code;
  } catch (error) {
    console.error(
      `Test launcher failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 2;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

if (import.meta.main) process.exitCode = await main();
