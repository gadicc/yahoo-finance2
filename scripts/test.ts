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
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { excludedDirectories, inventory, nativeInventory, select } from "./testing/inventory.ts";
import {
  assertFixtureSnapshot,
  fixtureSnapshot,
  nativeEnvironment,
  waitNativeChild,
} from "./testing/native.ts";

const repository = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const guard = fileURLToPath(new URL("./testing/offline.py", import.meta.url));
const help = `Usage: bun scripts/test.ts [OPTIONS] [TEST FILE OR DIRECTORY ...]
Default: offline replay, isolated files, four workers; test bodies remain serial.
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
      value === undefined || !value.length ||
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
      ) throw error;
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
      ) return;
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
    .filter((entry) =>
      entry.isFile() && /\.(?:json|jsonc|toml|[cm]?[jt]sx?)$/.test(entry.name)
    )
    .map((entry) => entry.name);
  // Includes current root TypeScript extends chains, Bun/Deno metadata and
  // runtime/release policies; nested configs and executable code are scanned.
  for (
    const file of [
      ...new Set([
        "package.json",
        "bun.lock",
        "deno.lock",
        ".bun-version",
        "bunfig.toml",
        ...rootInputs,
      ]),
    ].sort()
  ) {
    hashFile(join(root, file));
  }
  return hash.digest("hex");
}

function prepareCoverage(root: string) {
  const output = join(root, "coverage");
  mkdirSync(output, { recursive: true });
  if (lstatSync(output).isSymbolicLink() || relative(realpathSync(output), output) !== "") {
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

async function runOnce(
  root: string,
  files: string[],
  options: TestOptions,
  abort: AbortSignal,
): Promise<number> {
  const temporary = realpathSync(tmpdir());
  const temporaryRelative = relative(root, temporary);
  if (temporaryRelative === "" ||
    (!isAbsolute(temporaryRelative) && temporaryRelative !== ".." &&
      !temporaryRelative.startsWith(`..${sep}`))) {
    throw new Error("TMPDIR must be outside the repository and fixtures");
  }
  const scratch = realpathSync(mkdtempSync(join(temporary, "yf-replay-")));
  let before: string | undefined;
  try {
    if (options.native) before = fixtureSnapshot(root);
    const report = join(scratch, "junit.xml");
    const command = [
      process.execPath,
      "test",
      "--no-env-file",
      "--no-orphans",
      ...(options.native
        ? ["--preload", fileURLToPath(new URL("./testing/native-preload.ts", import.meta.url))]
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
    const child = spawn(options.native ? command[0] : "python3", options.native
      ? command.slice(1)
      : [guard, root, scratch, "--", ...command], {
      cwd: root,
      env: options.native ? nativeEnvironment(environment, scratch) : environment,
      stdio: "inherit",
      detached: !options.native || process.platform !== "win32",
      windowsHide: options.native,
    });
    let timeout = false;
    let code: number;
    if (options.native) {
      const result = await waitNativeChild(child, abort, options.runTimeout);
      code = result.code;
      timeout = result.timeout;
    } else {
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const terminate = () => {
        if (!child.pid) return;
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        killTimer ??= setTimeout(() => {
          try {
            process.kill(-child.pid!, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }, 1000);
      };
      const timer = setTimeout(() => {
        timeout = true;
        terminate();
      }, options.runTimeout);
      abort.addEventListener("abort", terminate, { once: true });
      if (abort.aborted) terminate();
      code = await new Promise<number>((resolveExit, reject) => {
        child.once("error", reject);
        child.once(
          "close",
          (code, signal) =>
            resolveExit(code ?? (signal ? signalCode(signal) : 1)),
        );
      }).finally(() => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        abort.removeEventListener("abort", terminate);
      });
    }
    if (options.coverage) {
      // Stage and atomically replace metrics in both modes. Only strict mode
      // has the kernel boundary denying writable repository aliases.
      const source = join(scratch, "coverage", "lcov.info");
      try {
        if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
          throw new Error("Coverage output must be a regular file");
        }
        const staging = mkdtempSync(join(root, "coverage", ".lcov-"));
        try {
          const temporaryOutput = join(staging, "lcov.info");
          writeFileSync(temporaryOutput, readFileSync(source), { flag: "wx" });
          renameSync(temporaryOutput, join(root, "coverage", "lcov.info"));
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        console.error(
          "No instrumented source coverage generated for this selection",
        );
      }
    }
    if (timeout) {
      console.error(`Test run timed out after ${options.runTimeout}ms`);
      return 124;
    }
    if (code !== 0 || abort.aborted) return code;
    // Bun can report success when a name filter executes no leaves. Require a
    // JUnit count and at least one executed (not merely skipped) test.
    const xml = readFileSync(report, "utf8");
    const cases = [
      ...xml.matchAll(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g),
    ];
    if (!cases.some((match) => !/<skipped\b/.test(match[0]))) {
      console.error(
        "No tests executed (empty file or unmatched test-name filter)",
      );
      return 2;
    }
    return 0;
  } finally {
    try {
      if (before !== undefined) assertFixtureSnapshot(root, before);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
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
    const currentPin = readFileSync(join(repository, ".bun-version"), "utf8")
      .trim();
    if (process.versions.bun !== currentPin) {
      throw new Error(
        `Tests require Bun ${currentPin}; restart with the pinned binary`,
      );
    }
    if (options.coverage && !options.list) prepareCoverage(root);
    const discovered = inventory(root);
    const allowed = options.native ? nativeInventory(discovered) : discovered;
    if (options.native) {
      const included = new Set(allowed);
      const omitted = discovered.filter((file) => !included.has(file));
      console.error(`Native trusted replay: no OS sandbox; omitted ${omitted.length} tooling files outside the library/portable-control scope:\n${omitted.join("\n")}`);
      if (options.paths.length) {
        const outside = select(root, discovered, options.paths).filter((file) => !included.has(file));
        if (outside.length) throw new Error(`Native selection is outside its portable scope: ${outside.join(", ")}; use strict Linux replay`);
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
