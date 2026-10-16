import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
import { projectIt as test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { buildNpm, parseBuildArgs, repository, rewriteModules, validateOutput } from "./build_npm.ts";

function temporary() {
  return realpathSync(mkdtempSync(path.join(tmpdir(), "yf-package-test-")));
}

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => entry.isDirectory() ? files(path.join(root, entry.name)) : [path.join(root, entry.name)]);
}

function digest(root: string) {
  return files(root).map((file) => [path.relative(root, file), statSync(file).mode & 0o777,
    createHash("sha256").update(readFileSync(file)).digest("hex")]);
}

test("npm build rejects unsafe destinations before touching their contents", () => {
  const scratch = temporary();
  const root = path.join(scratch, "repository");
  mkdirSync(path.join(root, "tests/fixtures/http"), { recursive: true });
  const sentinel = path.join(root, "tests/fixtures/http/keep.json");
  writeFileSync(sentinel, "keep");
  try {
    for (const destination of [root, path.join(root, "tests"), path.join(root, "tests/fixtures/http"), scratch]) {
      expect(() => validateOutput(destination, root)).toThrow();
    }
    const output = path.join(root, "npm");
    mkdirSync(output);
    writeFileSync(path.join(output, "user-owned.txt"), "preserve");
    expect(() => validateOutput(output, root)).toThrow("unrecognized");
    expect(readFileSync(path.join(output, "user-owned.txt"), "utf8")).toBe("preserve");
    symlinkSync(path.join(root, "tests/fixtures/http"), path.join(scratch, "alias"));
    expect(() => validateOutput(path.join(scratch, "alias"), root)).toThrow("symlink");
    expect(() => validateOutput(path.join(scratch, "alias/new"), root)).toThrow("symlink");
    symlinkSync(path.join(scratch, "missing"), path.join(scratch, "dangling"));
    expect(() => validateOutput(path.join(scratch, "dangling"), root)).toThrow("symlink");
    const custom = path.join(scratch, "custom");
    mkdirSync(custom);
    writeFileSync(path.join(custom, "important"), "preserve");
    expect(() => validateOutput(custom, root)).toThrow("new or empty");
    expect(readFileSync(sentinel, "utf8")).toBe("keep");
    expect(parseBuildArgs(["--out-dir", custom, "--version", "1.2.3"])).toEqual({ outDir: custom, version: "1.2.3" });
    expect(() => parseBuildArgs(["--out-dir"])).toThrow("Missing");
    expect(() => parseBuildArgs(["--version", "1.2.3", "--version", "2.0.0"])).toThrow("Duplicate");
    expect(() => parseBuildArgs(["--unknown"])).toThrow("Unknown");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("npm import rewriting covers JS and declaration references while preserving plain strings", () => {
  const input = `import data from "./data.json" with { type: "json" };
import type { A } from "./a.ts";
export { A } from "./a.ts";
export type B = import("../b.ts").B;
export type C = typeof import("../c.ts");
export const lazy = () => import("./lazy.ts");
export const text = "./leave.ts";`;
  const source = ts.createSourceFile("example.ts", input, ts.ScriptTarget.Latest, true);
  for (const commonJS of [false, true]) {
    const result = ts.transform(source, [rewriteModules(commonJS)]);
    try {
      const text = ts.createPrinter().printFile(result.transformed[0]);
      for (const specifier of ["./a.js", "../b.js", "../c.js", "./lazy.js"]) expect(text).toContain(specifier);
      expect(text).toContain('"./leave.ts"');
      expect(text.includes('with { type: "json" }')).toBe(!commonJS);
    } finally {
      result.dispose();
    }
  }
});

test("npm build emits deterministic public artifacts, declarations, schemas and portable bins", () => {
  const scratch = temporary();
  try {
    let first: string;
    let second: string;
    const previousMask = process.umask(0o077);
    try {
      first = buildNpm({ outDir: path.join(scratch, "first"), version: "9.8.7-build.1" });
      process.umask(0o002);
      second = buildNpm({ outDir: path.join(scratch, "second"), version: "9.8.7-build.1" });
    } finally {
      process.umask(previousMask);
    }
    expect(digest(first)).toEqual(digest(second));
    const ownedRoot = path.join(scratch, "owned-repository");
    const ownedOutput = path.join(ownedRoot, "npm");
    mkdirSync(ownedOutput, { recursive: true });
    writeFileSync(path.join(ownedOutput, ".yahoo-finance2-build.json"), readFileSync(path.join(first, ".yahoo-finance2-build.json")));
    expect(() => validateOutput(ownedOutput, ownedRoot)).not.toThrow();
    writeFileSync(path.join(ownedOutput, "user-file"), "preserve");
    expect(() => validateOutput(ownedOutput, ownedRoot)).toThrow("unrecognized");
    expect(readFileSync(path.join(ownedOutput, "user-file"), "utf8")).toBe("preserve");
    const source = JSON.parse(readFileSync(path.join(repository, "deno.json"), "utf8"));
    const pkg = JSON.parse(readFileSync(path.join(first, "package.json"), "utf8"));
    expect(Object.keys(pkg.exports)).toEqual(Object.keys(source.exports));
    expect(pkg.engines).toEqual({ node: ">=22.0.0" });
    expect(pkg.dependencies["@types/json-schema"]).toBe("^7.0.15");
    expect(pkg.dependencies["fetch-mock-cache"]).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(Object.keys(pkg.bin)).toEqual(["yahoo-finance2", "yahoo-finance", "yahoo-finance-mcp"]);
    for (const entry of Object.values(pkg.exports) as Record<string, { types: string; default: string }>[]) {
      for (const condition of ["import", "require"]) {
        expect(Object.keys(entry[condition])).toEqual(["types", "default"]);
        for (const target of Object.values(entry[condition])) expect(existsSync(path.join(first, target))).toBe(true);
      }
    }
    for (const format of ["esm", "script"]) {
      expect(files(path.join(first, format)).filter((file) => file.endsWith(".schema.json"))).toHaveLength(13);
      expect(JSON.parse(readFileSync(path.join(first, format, "deno.json"), "utf8"))).toEqual({ name: source.name, version: pkg.version });
      for (const file of files(path.join(first, format))) {
        expect(lstatSync(file).isSymbolicLink()).toBe(false);
        if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
        const text = readFileSync(file, "utf8");
        for (const reference of ts.preProcessFile(text, true, true).importedFiles) {
          expect(reference.fileName).not.toMatch(/\.ts$/);
          expect(reference.fileName).not.toMatch(/^(?:jsr:|npm:|@deno\/)/);
        }
      }
    }
    for (const file of [...new Set(Object.values(pkg.bin))] as string[]) {
      expect(readFileSync(path.join(first, file), "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
      expect(statSync(path.join(first, file)).mode & 0o777).toBe(0o755);
    }
    expect(files(first).some((file) => file.includes(".test.") || file.includes("node_modules") || file.includes("fixtures"))).toBe(false);
    expect(existsSync(path.join(first, "script/bin"))).toBe(false);
    expect(() => buildNpm({ outDir: first })).toThrow("new or empty");
    expect(() => buildNpm({ outDir: path.join(scratch, "invalid"), version: "1.2.3-01" })).toThrow("semantic version");
    expect(existsSync(path.join(scratch, "invalid"))).toBe(false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60000);


test("compiler inputs reject imported JSON/source/schema links and escapes while preserving prior output", () => {
  const scratch = temporary();
  const clone = path.join(scratch, "project");
  const put = (name: string, text: string) => {
    const file = path.join(clone, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  };
  const metadata = JSON.parse(readFileSync(path.join(repository, "deno.json"), "utf8"));
  metadata.exports = { ".": "./src/index.ts" };
  const index = 'import data from "./payload.json" with { type: "json" }; export default data;';
  const payload = '{"value":"from-project"}';
  const run = () => spawnSync(process.execPath, [path.join(clone, "scripts/build_npm.ts")], {
    cwd: scratch, encoding: "utf8", timeout: 30000,
  });
  try {
    // This is a tiny compiler fixture, not an installed public-package consumer.
    // Linking the tool graph also verifies the legitimate dependency-link exemption.
    mkdirSync(clone);
    symlinkSync(path.join(repository, "node_modules"), path.join(clone, "node_modules"));
    put("scripts/build_npm.ts", readFileSync(path.join(repository, "scripts/build_npm.ts"), "utf8"));
    put("package.json", '{"private":true,"type":"module"}');
    put("deno.json", JSON.stringify(metadata));
    put("src/index.ts", index);
    put("src/payload.json", payload);
    put("src/unused.schema.json", '{"type":"object"}');
    for (const name of ["yahoo-finance", "yahoo-finance-mcp"]) {
      put(`bin/${name}.ts`, '#!/usr/bin/env node\nimport metadata from "../deno.json" with { type: "json" }; console.log(metadata.version);');
    }
    put("LICENSE", "test license");
    put("README.md", "test readme");
    put("skills/example/SKILL.md", "test skill");
    const built = run();
    expect(built.status).toBe(0);
    expect(built.stderr).toBe("");
    const output = path.join(clone, "npm");
    const baseline = digest(output);
    const refuses = (message: string) => {
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(digest(output)).toEqual(baseline);
      expect(readdirSync(clone).filter((name) => name.startsWith(".yf-npm-build-"))).toEqual([]);
    };
    const external = path.join(scratch, "external.json");
    writeFileSync(external, '{"value":"from-project","externalSentinel":"must-not-be-packaged"}');
    unlinkSync(path.join(clone, "src/payload.json"));
    symlinkSync(external, path.join(clone, "src/payload.json"));
    refuses("symlink build input");
    unlinkSync(path.join(clone, "src/payload.json"));
    put("src/payload.json", payload);

    const externalDirectory = path.join(scratch, "external-directory");
    mkdirSync(externalDirectory);
    writeFileSync(path.join(externalDirectory, "payload.json"), payload);
    symlinkSync(externalDirectory, path.join(clone, "src/linked"));
    put("src/index.ts", index.replace("./payload.json", "./linked/payload.json"));
    refuses("symlink build input");
    unlinkSync(path.join(clone, "src/linked"));
    put("src/index.ts", index.replace("./payload.json", "../../external.json"));
    refuses("outside the repository and dependencies");
    put("src/index.ts", index);

    // An unimported schema is still a packaged asset; links cannot be silently skipped.
    unlinkSync(path.join(clone, "src/unused.schema.json"));
    symlinkSync(external, path.join(clone, "src/unused.schema.json"));
    refuses("symlink schema input");
    unlinkSync(path.join(clone, "src/unused.schema.json"));
    put("src/unused.schema.json", '{"type":"object"}');

    const externalSource = path.join(scratch, "external.ts");
    writeFileSync(externalSource, "export default 123;");
    unlinkSync(path.join(clone, "src/index.ts"));
    symlinkSync(externalSource, path.join(clone, "src/index.ts"));
    refuses("symlink build input");
    unlinkSync(path.join(clone, "src/index.ts"));
    put("src/index.ts", index);
    metadata.exports = { ".": "../external.ts" };
    put("deno.json", JSON.stringify(metadata));
    refuses("outside the repository");
    metadata.exports = { ".": "./src/index.ts" };
    put("deno.json", JSON.stringify(metadata));
    const externalMetadata = path.join(scratch, "external-deno.json");
    writeFileSync(externalMetadata, JSON.stringify(metadata));
    unlinkSync(path.join(clone, "deno.json"));
    symlinkSync(externalMetadata, path.join(clone, "deno.json"));
    refuses("symlink build input");
    unlinkSync(path.join(clone, "deno.json"));
    const fifo = spawnSync("python3", ["-c", "import os,sys; os.mkfifo(sys.argv[1])", path.join(clone, "deno.json")]);
    expect(fifo.status).toBe(0);
    refuses("nonregular build input");
    expect(JSON.parse(readFileSync(path.join(output, "esm/src/payload.json"), "utf8"))).toEqual({ value: "from-project" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60000);
