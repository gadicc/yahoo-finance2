import { EventEmitter } from "node:events";
import { spawnSync, type ChildProcess, type spawn } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Application,
  Comment,
  DeclarationReflection,
  ReflectionKind,
} from "typedoc";
import { projectIt as test } from "../tests/helpers/runner.ts";
import { expect } from "../tests/helpers/assertions.ts";
import {
  buildDocs,
  inputDigest,
  openDocs,
  openerArgs,
  parseArgs,
  watchDocs,
} from "./docs.ts";
import {
  diagnosticKey,
  normalizeDenoLinks,
  warningDelta,
} from "./docs/model.ts";
import {
  marker,
  markerName,
  outputTransaction,
  validateOutput,
} from "./docs/output.ts";

import { sourceProvenance, sourceUrl } from "./docs/provenance.ts";

function scratch() {
  return realpathSync(mkdtempSync(join(tmpdir(), "yf-docs-test-")));
}
function repository(parent: string) {
  const root = join(parent, "repo");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "scripts/docs"), { recursive: true });
  for (const file of [
    "scripts/docs.ts",
    "deno.json",
    "package.json",
    "bun.lock",
    "tsconfig.base.json",
    "tsconfig.library.json",
  ])
    writeFileSync(join(root, file), "{}");
  writeFileSync(join(root, "src/sample.ts"), "good");
  writeFileSync(
    join(root, "scripts/docs/worker.ts"),
    `
import {readFileSync,writeFileSync} from 'node:fs'; import {join} from 'node:path';
const [root,out]=process.argv.slice(2); const content=readFileSync(join(root,'src/sample.ts'),'utf8');
if(content==='hang') {writeFileSync(join(out,'started'),String(process.pid)); setInterval(()=>{},1000); await new Promise(()=>{});}
if(content==='bad') throw Error('deliberate invalid source');
writeFileSync(join(out,'index.html'),content);writeFileSync(join(out,'documentation-report.json'),'{}');
`,
  );
  return root;
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 8000;
  while (true) {
    try {
      if (check()) return;
    } catch (error) {
      // Publication moves the old directory aside before installing its replacement.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (Date.now() > deadline)
      throw new Error("Documentation control timed out");
    await new Promise((accept) => setTimeout(accept, 30));
  }
}

test("docs arguments and openers use bounded explicit shell-free argv", async () => {
  expect(parseArgs(["gen"], "/repo").output).toBe("/repo/jsdocs");
  for (const args of [[], ["unknown"], ["gen", "--bad"], ["lint", "--out-dir"]])
    expect(() => parseArgs(args)).toThrow();
  expect(openerArgs("linux", "/tmp/space & quote.html")).toEqual([
    "xdg-open",
    "file:///tmp/space%20&%20quote.html",
  ]);
  expect(openerArgs("darwin", "/tmp/index.html")[0]).toBe("open");
  expect(openerArgs("win32", "/tmp/index.html").slice(0, 2)).toEqual([
    "rundll32.exe",
    "url.dll,FileProtocolHandler",
  ]);
  expect(() => openerArgs("aix", "/tmp/index.html")).toThrow();
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs");
  try {
    await buildDocs(root, output, false);
    const calls: unknown[] = [];
    const launch = ((...args: unknown[]) => {
      calls.push(args);
      const child = new EventEmitter() as ChildProcess;
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    }) as typeof spawn;
    await openDocs(output, root, launch, "linux");
    expect(calls).toEqual([
      [
        "xdg-open",
        [`file://${output}/index.html`],
        { stdio: "ignore", shell: false },
      ],
    ]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs reject foreign outputs, fixtures, symlinks and hardlinks before replacement", () => {
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs");
  try {
    for (const path of [
      root,
      parent,
      join(root, "src"),
      join(root, "src/output"),
    ])
      expect(() => validateOutput(path, root)).toThrow();
    mkdirSync(output);
    writeFileSync(join(output, "foreign"), "preserve");
    expect(() => validateOutput(output, root)).toThrow("unowned");
    expect(readFileSync(join(output, "foreign"), "utf8")).toBe("preserve");
    symlinkSync(output, join(parent, "alias"));
    expect(() => validateOutput(join(parent, "alias"), root)).toThrow();
    expect(() => validateOutput(join(parent, "alias/new"), root)).toThrow();
    writeFileSync(join(output, markerName), marker);
    linkSync(join(output, "foreign"), join(output, "hardlink"));
    expect(() => validateOutput(output, root)).toThrow("regular");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs transaction preserves last-good output on failure and serializes writers", async () => {
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs");
  try {
    await buildDocs(root, output, false);
    writeFileSync(join(root, "src/sample.ts"), "bad");
    await expect(buildDocs(root, output, false)).rejects.toThrow(
      "worker exited",
    );
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("good");
    expect(existsSync(`${output}.lock`)).toBe(false);
    const transaction = outputTransaction(output, root);
    try {
      expect(() => outputTransaction(output, root)).toThrow();
    } finally {
      transaction.close();
    }
    writeFileSync(join(root, "src/sample.ts"), "new");
    await buildDocs(root, output, false);
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("new");
    const before = readdirSync(parent);
    await buildDocs(root, output, true);
    expect(readdirSync(parent)).toEqual(before);
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("new");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs watcher recovers after invalid edits and aborts its running child", async () => {
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs"),
    abort = new AbortController();
  const watcher = watchDocs(root, output, abort.signal);
  try {
    await until(() => existsSync(join(output, "index.html")));
    const digest = inputDigest(root);
    writeFileSync(join(root, "src/sample.ts"), "bad");
    expect(inputDigest(root) === digest).toBe(false);
    await new Promise((accept) => setTimeout(accept, 700));
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("good");
    writeFileSync(join(root, "src/sample.ts"), "recovered");
    await until(
      () => readFileSync(join(output, "index.html"), "utf8") === "recovered",
    );
    writeFileSync(join(root, "src/sample.ts"), "hang");
    let pid = 0;
    await until(() => {
      const stage = readdirSync(root).find(
        (entry) =>
          entry.startsWith(".yf-docs-") &&
          existsSync(join(root, entry, "started")),
      );
      if (!stage) return false;
      pid = Number(readFileSync(join(root, stage, "started"), "utf8"));
      return true;
    });
    process.kill(pid, 0);
    abort.abort();
    await watcher;
    expect(() => process.kill(pid, 0)).toThrow();
    expect(existsSync(`${output}.lock`)).toBe(false);
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("recovered");
  } finally {
    abort.abort();
    await watcher;
    rmSync(parent, { recursive: true, force: true });
  }
}, 15000);

test("docs baseline retains meaningful names, source identity and duplicate counts", () => {
  const a = {
    level: 2,
    message: "A, defined in src/a.ts, does not have any documentation",
  };
  const b = { ...a, message: a.message.replace("A,", "B,") };
  expect(diagnosticKey("<unknown>//tmp/one/src/a.ts", "/tmp/one")).toBe(
    "src/a.ts",
  );
  expect(warningDelta([a, a, b], [a]).added).toEqual([
    { ...a, count: 1 },
    { ...b, count: 1 },
  ]);
  expect(warningDelta([], [a]).resolved).toEqual([{ ...a, count: 1 }]);
});

test("docs Deno links resolve only actual exported modules and named defaults", () => {
  const parent = scratch();
  try {
    writeFileSync(
      join(parent, "quote.ts"),
      "export default function quote() {}",
    );
    const module = new DeclarationReflection(
      "quoteModule",
      ReflectionKind.Module,
    );
    const target = new DeclarationReflection(
      "default",
      ReflectionKind.Function,
      module,
    );
    module.children = [target];
    const owner = new DeclarationReflection("owner", ReflectionKind.Function);
    owner.comment = new Comment([
      {
        kind: "inline-tag",
        tag: "@linkcode",
        text: "[modules/quote].quote quote()",
      },
    ]);
    const project = { reflections: { [owner.id]: owner } },
      modules = new Map([[join(parent, "quote.ts"), module]]);
    const proof = normalizeDenoLinks(
      project,
      modules,
      { "./modules/quote": "./quote.ts" },
      parent,
    );
    expect(proof[0]?.target).toBe(target.id);
    expect(proof[0]?.tag).toBe("@linkcode");
    expect(proof[0]?.label).toBe("quote()");
    for (const text of ["[missing] label", "[modules/quote].invented label"]) {
      owner.comment = new Comment([{ kind: "inline-tag", tag: "@link", text }]);
      expect(() =>
        normalizeDenoLinks(
          project,
          modules,
          { "./modules/quote": "./quote.ts" },
          parent,
        ),
      ).toThrow("Unknown Deno");
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

function gitCommand(root: string, ...args: string[]) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=K05 test",
      "-c",
      "user.email=k05@example.invalid",
      "-C",
      root,
      ...args,
    ],
    { encoding: "utf8", shell: false },
  );
  if (result.status !== 0)
    throw new Error(`Git control failed: ${result.stderr}`);
  return result.stdout.trim();
}
function committedRepository(parent: string) {
  const root = repository(parent);
  gitCommand(root, "-c", "init.templateDir=", "init", "--initial-branch=dev");
  gitCommand(
    root,
    "config",
    "remote.origin.url",
    "git@github.com:gadicc/yahoo-finance2.git",
  );
  gitCommand(root, "add", "src");
  gitCommand(root, "commit", "-m", "initial source");
  return root;
}

test("docs provenance uses exact committed branch bytes and omits dirty, masked, unknown or archive sources", () => {
  const parent = scratch(),
    root = committedRepository(parent),
    source = join(root, "src/sample.ts");
  try {
    const dev = gitCommand(root, "rev-parse", "HEAD");
    gitCommand(root, "checkout", "-b", "contributor-branch");
    writeFileSync(source, "changed branch source\n");
    gitCommand(root, "add", "src");
    gitCommand(root, "commit", "-m", "branch source");
    const commit = gitCommand(root, "rev-parse", "HEAD");
    expect(commit === dev).toBe(false);
    const provenance = sourceProvenance(root);
    expect(provenance.kind).toBe("commit");
    expect(sourceUrl(provenance, root, source, 2)).toBe(
      `https://github.com/gadicc/yahoo-finance2/blob/${commit}/src/sample.ts#L2`,
    );
    expect(sourceUrl(provenance, root, join(parent, "dependency.ts"), 1)).toBe(
      undefined,
    );
    for (const remote of [
      "https://github.com/gadicc/yahoo-finance2.git",
      "git@github.com:gadicc/yahoo-finance2",
      "ssh://git@github.com:22/gadicc/yahoo-finance2.git",
    ]) {
      gitCommand(root, "config", "remote.origin.url", remote);
      expect(sourceProvenance(root).kind).toBe("commit");
    }
    gitCommand(root, "update-index", "--assume-unchanged", "src/sample.ts");
    writeFileSync(source, "uncommitted source\n");
    expect(sourceProvenance(root).kind).toBe("omitted");
    expect(sourceUrl(sourceProvenance(root), root, source, 2)).toBe(undefined);
    writeFileSync(source, "changed branch source\n");
    writeFileSync(join(root, "src/untracked.ts"), "extra source");
    expect(sourceProvenance(root).kind).toBe("omitted");
    rmSync(join(root, "src/untracked.ts"));
    gitCommand(
      root,
      "config",
      "remote.origin.url",
      "https://github.com/someone/other.git",
    );
    expect(sourceProvenance(root).kind).toBe("omitted");
    rmSync(join(root, ".git"), { recursive: true });
    const archive = sourceProvenance(root);
    expect(archive.kind).toBe("omitted");
    expect(sourceUrl(archive, root, source, 1)).toBe(undefined);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs input fingerprint binds commit identity even when source bytes do not change", () => {
  const parent = scratch(),
    root = committedRepository(parent);
  try {
    const first = inputDigest(root),
      provenance = sourceProvenance(root);
    gitCommand(root, "commit", "--allow-empty", "-m", "new exact identity");
    expect(sourceProvenance(root).sourceDigest).toBe(provenance.sourceDigest);
    expect(inputDigest(root) === first).toBe(false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs preserve the last successful backup through failed rollback and repeated close", () => {
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs");
  mkdirSync(output);
  writeFileSync(join(output, markerName), marker);
  writeFileSync(join(output, "index.html"), "last successful docs");
  let renames = 0;
  const transaction = outputTransaction(output, root, (from, to) => {
    renames++;
    if (renames > 1) throw new Error("deliberate publish and restore failure");
    renameSync(from, to);
  });
  try {
    writeFileSync(join(transaction.staging, "index.html"), "new docs");
    expect(() => transaction.publish()).toThrow(
      `previous output preserved at ${output}.lock/previous`,
    );
    transaction.close();
    transaction.close();
    expect(
      readFileSync(join(`${output}.lock`, "previous/index.html"), "utf8"),
    ).toBe("last successful docs");
    expect(existsSync(transaction.staging)).toBe(false);
    expect(() => outputTransaction(output, root)).toThrow();
    expect(
      readFileSync(join(`${output}.lock`, "previous/index.html"), "utf8"),
    ).toBe("last successful docs");
  } finally {
    transaction.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs provenance ignores real Git replacement refs while retaining original committed matches", () => {
  const parent = scratch(),
    root = committedRepository(parent),
    source = join(root, "src/sample.ts");
  try {
    writeFileSync(source, "export const value=1;\n");
    gitCommand(root, "add", "src");
    gitCommand(root, "commit", "-m", "original source");
    const original = gitCommand(root, "rev-parse", "HEAD");
    writeFileSync(source, "export const value=2;\n");
    gitCommand(root, "add", "src");
    gitCommand(root, "commit", "-m", "replacement source");
    const replacement = gitCommand(root, "rev-parse", "HEAD");
    gitCommand(root, "reset", "--hard", original);
    gitCommand(root, "replace", original, replacement);
    writeFileSync(source, "export const value=2;\n");
    expect(gitCommand(root, "show", `${original}:src/sample.ts`)).toBe(
      "export const value=2;",
    );
    expect(
      gitCommand(
        root,
        "--no-replace-objects",
        "show",
        `${original}:src/sample.ts`,
      ),
    ).toBe("export const value=1;");
    expect(sourceProvenance(root).kind).toBe("omitted");
    expect(sourceUrl(sourceProvenance(root), root, source, 1)).toBe(undefined);
    writeFileSync(source, "export const value=1;\n");
    const matching = sourceProvenance(root);
    expect(matching.kind).toBe("commit");
    expect(sourceUrl(matching, root, source, 1)).toBe(
      `https://github.com/gadicc/yahoo-finance2/blob/${original}/src/sample.ts#L1`,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("docs watch survives missing configuration and rebuilds after restore and source edit", async () => {
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs"),
    abort = new AbortController();
  let settled = false;
  const watcher = watchDocs(root, output, abort.signal).finally(() => {
    settled = true;
  });
  try {
    await until(() => existsSync(join(output, "index.html")));
    rmSync(join(root, "package.json"));
    await new Promise((accept) => setTimeout(accept, 700));
    expect(settled).toBe(false);
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("good");
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "src/sample.ts"), "restored then edited");
    await until(
      () =>
        readFileSync(join(output, "index.html"), "utf8") ===
        "restored then edited",
    );
    expect(settled).toBe(false);
    abort.abort();
    await watcher;
    expect(existsSync(`${output}.lock`)).toBe(false);
  } finally {
    abort.abort();
    await watcher;
    rmSync(parent, { recursive: true, force: true });
  }
}, 15000);

test("docs reject real TypeDoc bootstrap/conversion errors and preserve the previous successful output", async () => {
  const parent = scratch(),
    root = repository(parent),
    output = join(root, "jsdocs");
  const config = JSON.stringify({
    compilerOptions: { target: "ES2022", strict: true },
    include: ["src/**/*.ts"],
  });
  try {
    writeFileSync(
      join(root, "src/sample.ts"),
      "/** Documented bootstrap control. */\nexport const sample = 1;\n",
    );
    writeFileSync(
      join(root, "deno.json"),
      JSON.stringify({ exports: { ".": "./src/sample.ts" } }),
    );
    writeFileSync(join(root, "tsconfig.library.json"), config);
    writeFileSync(
      join(root, "scripts/docs/worker.ts"),
      `await import(${JSON.stringify(new URL("./docs/worker.ts", import.meta.url).href)});`,
    );
    writeFileSync(join(root, "scripts/docs/diagnostics-baseline.json"), "[]");
    writeFileSync(join(root, "scripts/docs/parser-compatibility.json"), "[]");
    await buildDocs(root, output, false);
    const report = JSON.parse(
      readFileSync(join(output, "documentation-report.json"), "utf8"),
    );
    expect(report.tool).toBe(`typedoc@${Application.VERSION}`);
    const priorHtml = readFileSync(join(output, "index.html"), "utf8");
    const priorModel = readFileSync(join(output, "reflections.json"), "utf8");
    writeFileSync(
      join(root, "tsconfig.library.json"),
      JSON.stringify({
        ...JSON.parse(config),
        typedocOptions: { k05UnknownRequiredOption: true },
      }),
    );
    await expect(buildDocs(root, output, false)).rejects.toThrow(
      "worker exited",
    );
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe(priorHtml);
    expect(readFileSync(join(output, "reflections.json"), "utf8")).toBe(
      priorModel,
    );
    expect(existsSync(`${output}.lock`)).toBe(false);
    writeFileSync(join(root, "tsconfig.library.json"), config);
    writeFileSync(
      join(root, "src/sample.ts"),
      "/** Documented conversion control. */\nexport const sample: string = 1;\n",
    );
    await expect(buildDocs(root, output, false)).rejects.toThrow(
      "worker exited",
    );
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe(priorHtml);
    expect(readFileSync(join(output, "reflections.json"), "utf8")).toBe(
      priorModel,
    );
    writeFileSync(
      join(root, "src/sample.ts"),
      "/** Documented bootstrap control. */\nexport const sample = 1;\n",
    );
    await buildDocs(root, output, false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 30000);

test("docs fingerprint follows optional config closure, bin inputs and mutable resolution inventory", () => {
  const parent = scratch(),
    root = repository(parent);
  try {
    mkdirSync(join(root, "bin"));
    mkdirSync(join(root, "configs"));
    mkdirSync(join(root, "types"));
    writeFileSync(join(root, "bin/runtime.ts"), "export const runtime = 1;\n");
    writeFileSync(
      join(root, "configs/base.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          typeRoots: ["../types"],
          types: ["*"],
        },
      }),
    );
    writeFileSync(
      join(root, "tsconfig.library.json"),
      JSON.stringify({
        extends: "./configs/base.json",
        include: ["src/**/*.ts", "bin/**/*.ts"],
      }),
    );
    const initial = inputDigest(root);
    writeFileSync(join(root, "bin/runtime.ts"), "export const runtime = 2;\n");
    expect(inputDigest(root) === initial).toBe(false);
    writeFileSync(join(root, "bin/runtime.ts"), "export const runtime = 1;\n");
    expect(inputDigest(root)).toBe(initial);
    writeFileSync(
      join(root, "configs/base.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2024",
          typeRoots: ["../types"],
          types: ["*"],
        },
      }),
    );
    expect(inputDigest(root) === initial).toBe(false);
    writeFileSync(
      join(root, "configs/base.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          typeRoots: ["../types"],
          types: ["*"],
        },
      }),
    );
    expect(inputDigest(root)).toBe(initial);
    writeFileSync(
      join(root, "tsdoc.json"),
      JSON.stringify({ extends: ["./configs/tags.json"] }),
    );
    writeFileSync(join(root, "configs/tags.json"), "{}");
    const withTsdoc = inputDigest(root);
    expect(withTsdoc === initial).toBe(false);
    writeFileSync(
      join(root, "configs/tags.json"),
      JSON.stringify({ noStandardTags: true }),
    );
    expect(inputDigest(root) === withTsdoc).toBe(false);
    rmSync(join(root, "tsdoc.json"));
    expect(inputDigest(root)).toBe(initial);
    mkdirSync(join(root, "types/new-package"));
    writeFileSync(
      join(root, "types/new-package/index.d.ts"),
      "declare const k05NewTypeRoot: string;\n",
    );
    expect(inputDigest(root) === initial).toBe(false);
    rmSync(join(root, "types/new-package"), { recursive: true });
    expect(inputDigest(root)).toBe(initial);
    mkdirSync(join(root, "local-package"));
    writeFileSync(
      join(root, "local-package/package.json"),
      JSON.stringify({ types: "./first.d.ts" }),
    );
    writeFileSync(
      join(root, "local-package/first.d.ts"),
      "export type Value = string;\n",
    );
    writeFileSync(
      join(root, "local-package/second.d.ts"),
      "export type Value = number;\n",
    );
    writeFileSync(
      join(root, "src/sample.ts"),
      "import type { Value } from '../local-package'; export type Result = Value;\n",
    );
    const firstResolution = inputDigest(root);
    writeFileSync(
      join(root, "local-package/package.json"),
      JSON.stringify({ types: "./second.d.ts" }),
    );
    expect(inputDigest(root) === firstResolution).toBe(false);
    writeFileSync(
      join(root, "local-package/package.json"),
      JSON.stringify({ types: "./first.d.ts" }),
    );
    expect(inputDigest(root)).toBe(firstResolution);
    writeFileSync(
      join(root, "tsconfig.library.json"),
      JSON.stringify({ extends: "@tsconfig/node22/tsconfig.json" }),
    );
    expect(() => inputDigest(root)).toThrow("explicit repository-local");
    writeFileSync(
      join(root, "tsconfig.library.json"),
      JSON.stringify({ extends: "../outside.json" }),
    );
    writeFileSync(join(parent, "outside.json"), "{}");
    expect(() => inputDigest(root)).toThrow("repository-local");
    writeFileSync(
      join(root, "tsconfig.library.json"),
      JSON.stringify({ references: [{ path: "./another-project" }] }),
    );
    expect(() => inputDigest(root)).toThrow("project references");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 15000);
