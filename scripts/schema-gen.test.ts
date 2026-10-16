import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { projectIt as test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import {
  createSchemaScheduler,
  findSchemaSources,
  generateSchema,
  parseSchemaArgs,
  runSchemas,
  schemaMain,
} from "./schema-gen.ts";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "yf-schema-test-"));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, "scripts"));
  writeFileSync(
    path.join(root, "scripts/schema-tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "es2020",
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        allowImportingTsExtensions: true,
        types: [],
        lib: ["es2020"],
      },
    }),
  );
  const write = (name: string, source: string) =>
    writeFileSync(path.join(root, "src", name), source);
  write("shared.ts", "export interface Shared { value: string; }");
  write(
    "example.ts",
    '// @yf-schema\nimport type { Shared } from "./shared.ts";\nexport interface Example { shared: Shared; callback?: () => void; }',
  );
  const schema = path.join(root, "src/example.schema.json");
  return {
    root,
    write,
    schema,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
const quiet = () => {};
const flags = (args: string[] = []) => parseSchemaArgs(args);

test("schema CLI flags and errors have predictable exit codes", () => {
  expect(flags(["-f", "--no-force", "-v", "--", "-file.ts"])).toMatchObject({
    force: false,
    verbose: true,
    files: ["-file.ts"],
  });
  expect(() => flags(["--unknown"])).toThrow("Unknown option");
  expect(() => flags(["--constructor"])).toThrow("Unknown option");
  expect(() => flags(["--check", "--watch"])).toThrow("cannot be combined");
  expect(schemaMain(["--help"], { root: "/missing", log: quiet })).toBe(0);
  expect(schemaMain(["--unknown"], { log: quiet })).toBe(2);
  expect(schemaMain([], { root: "/missing", log: quiet })).toBe(1);
});

// Multiple schema generations need a bounded integration budget on constrained CI.
test("schema check is read-only and detects imported changes regardless of timestamps", () => {
  const f = fixture();
  try {
    const options = { root: f.root, log: quiet };
    expect(runSchemas(flags(["--check"]), options)).toBe(1);
    expect(existsSync(f.schema)).toBe(false);
    expect(runSchemas(flags(), options)).toBe(0);
    const first = readFileSync(f.schema, "utf8");
    const initialTime = statSync(f.schema).mtimeMs;
    expect(JSON.parse(first).definitions.Example.properties.callback).toEqual(
      {},
    );
    expect(runSchemas(flags(["--check"]), options)).toBe(0);
    expect(statSync(f.schema).mtimeMs).toBe(initialTime);
    f.write("shared.ts", "export interface Shared { value: number; }");
    utimesSync(path.join(f.root, "src/shared.ts"), 1, 1);
    expect(runSchemas(flags(["--check"]), options)).toBe(1);
    expect(readFileSync(f.schema, "utf8")).toBe(first);
    expect(statSync(f.schema).mtimeMs).toBe(initialTime);
    expect(runSchemas(flags(["src/example.ts"]), options)).toBe(0);
    expect(
      JSON.parse(readFileSync(f.schema, "utf8")).definitions.Shared.properties
        .value,
    ).toEqual({ type: "number" });
    expect(runSchemas(flags(["--check", "--force"]), options)).toBe(0);
    const newTime = statSync(f.schema).mtimeMs;
    expect(runSchemas(flags(["--force"]), options)).toBe(0);
    expect(statSync(f.schema).mtimeMs).toBe(newTime);
    writeFileSync(f.schema, "invalid json");
    expect(runSchemas(flags(["--check"]), options)).toBe(1);
    expect(readFileSync(f.schema, "utf8")).toBe("invalid json");
    expect(runSchemas(flags(), options)).toBe(0);
  } finally {
    f.cleanup();
  }
}, 30_000);

test("generation failures preserve every output and create no JSON placeholders", () => {
  const f = fixture();
  try {
    const options = { root: f.root, log: quiet };
    expect(runSchemas(flags(), options)).toBe(0);
    const first = readFileSync(f.schema, "utf8");
    f.write(
      "example.ts",
      "// @yf-schema\nexport interface Example { changed: boolean; }",
    );
    f.write(
      "broken.ts",
      "// @yf-schema\nexport interface Broken { value: DoesNotExist; }",
    );
    expect(runSchemas(flags(), options)).toBe(1);
    expect(readFileSync(f.schema, "utf8")).toBe(first);
    expect(existsSync(path.join(f.root, "src/broken.schema.json"))).toBe(false);
    expect(runSchemas(flags(["missing.ts"]), options)).toBe(1);
    expect(runSchemas(flags(["example.json"]), options)).toBe(1);
  } finally {
    f.cleanup();
  }
});

test("missing generated JSON imports are virtual, while real JSON is checked", () => {
  const f = fixture();
  try {
    f.write(
      "example.ts",
      '// @yf-schema\nimport schema from "./example.schema.json" with { type: "json" };\nexport interface Example { value: string; }\nexport const object: object = schema;',
    );
    expect(runSchemas(flags(["--check"]), { root: f.root, log: quiet })).toBe(
      1,
    );
    expect(existsSync(f.schema)).toBe(false);
    expect(runSchemas(flags(), { root: f.root, log: quiet })).toBe(0);
    expect(existsSync(f.schema)).toBe(true);
    writeFileSync(f.schema, "invalid json");
    expect(runSchemas(flags(["--check"]), { root: f.root, log: quiet })).toBe(
      1,
    );
    expect(readFileSync(f.schema, "utf8")).toBe("invalid json");
    expect(runSchemas(flags(), { root: f.root, log: quiet })).toBe(0);
    f.write("real.json", "invalid json");
    f.write(
      "example.ts",
      '// @yf-schema\nimport data from "./real.json" with { type: "json" };\nexport interface Example { value: string; }\nexport const object: object = data;',
    );
    const previous = readFileSync(f.schema, "utf8");
    expect(runSchemas(flags(), { root: f.root, log: quiet })).toBe(1);
    expect(readFileSync(f.schema, "utf8")).toBe(previous);
  } finally {
    f.cleanup();
  }
});

// Repeated compiler subprocess startup needs a bounded integration budget on CI.
test("CLI subprocess reports stale input and repair without network", () => {
  const f = fixture();
  try {
    const cli = path.resolve("scripts/schema-gen.ts");
    const run = (...args: string[]) =>
      spawnSync("bun", [cli, ...args], { cwd: f.root, encoding: "utf8" });
    expect(run("--check").status).toBe(1);
    expect(existsSync(f.schema)).toBe(false);
    expect(run("src/example.ts").status).toBe(0);
    expect(run("--check").status).toBe(0);
    expect(run("--bad").status).toBe(2);
  } finally {
    f.cleanup();
  }
}, 30_000);

test("watch scheduling coalesces bursts, preserves in-flight edits and recovers from failures", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const errors: unknown[] = [];
  const scheduler = createSchemaScheduler(
    async () => {
      calls++;
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      if (calls === 2) throw new Error("temporary invalid source");
    },
    5,
    (error) => errors.push(error),
  );
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 2000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("scheduler timed out");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  try {
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    await waitFor(() => calls === 1);
    scheduler.schedule();
    scheduler.schedule();
    release!();
    await waitFor(() => calls === 2 && errors.length === 1);
    scheduler.schedule();
    await waitFor(() => calls === 3);
    scheduler.close();
    scheduler.schedule();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(3);
  } finally {
    scheduler.close();
    release?.();
  }
});

test("all committed production schemas retain byte parity after the comment migration", () => {
  const config = path.resolve("scripts/schema-tsconfig.json");
  const sources = findSchemaSources(path.resolve("src"));
  expect(sources).toHaveLength(13);
  for (const source of sources) {
    expect(generateSchema(source, config)).toBe(
      readFileSync(source.replace(/\.ts$/, ".schema.json"), "utf8"),
    );
  }
}, 120000);

test("real watch brackets initial, failed and repaired scans and closes on SIGTERM", async () => {
  const f = fixture();
  const child = spawn(
    "bun",
    [path.resolve("scripts/schema-gen.ts"), "--watch", "src/example.ts"],
    {
      cwd: f.root,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(child, "exit");
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 15000;
    while (!condition()) {
      if (child.exitCode !== null || Date.now() > deadline) {
        throw new Error(`watch did not progress: ${output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  try {
    const scanEvents = () =>
      output.split(/\r?\n/).flatMap((line) => {
        if (line === "Schema scan started.") return ["start"];
        if (line === "Schema scan complete; watching.") return ["success"];
        if (line === "Schema generation failed; still watching.") {
          return ["failure"];
        }
        return [];
      });
    await waitFor(() => scanEvents().includes("success"));
    expect(scanEvents()).toEqual(["start", "success"]);
    const initialSchema = readFileSync(f.schema, "utf8");
    expect(
      JSON.parse(initialSchema).definitions.Shared.properties.value.type,
    ).toBe("string");
    f.write("shared.ts", "export interface Shared {");
    await waitFor(() => scanEvents().includes("failure"));
    expect(scanEvents()).toEqual(["start", "success", "start", "failure"]);
    expect(readFileSync(f.schema, "utf8")).toBe(initialSchema);
    expect(output).toContain("src/shared.ts");
    expect(output).toContain("TS1005");
    f.write(
      "shared.ts",
      "export interface Shared { value: number; final: boolean; }",
    );
    await waitFor(() => scanEvents().length >= 6);
    expect(scanEvents()).toEqual([
      "start",
      "success",
      "start",
      "failure",
      "start",
      "success",
    ]);
    expect(
      JSON.parse(readFileSync(f.schema, "utf8")).definitions.Shared.properties
        .value.type,
    ).toBe("number");
    expect(
      JSON.parse(readFileSync(f.schema, "utf8")).definitions.Shared.properties
        .final.type,
    ).toBe("boolean");
    child.kill("SIGTERM");
    const [code, signal] = await exited;
    expect(code).toBe(0);
    expect(signal).toBe(null);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await exited;
    f.cleanup();
  }
}, 30000);

test("default scans reject empty inventories and orphan schemas without deleting them", () => {
  const f = fixture();
  try {
    const options = { root: f.root, log: quiet };
    expect(runSchemas(flags(), options)).toBe(0);
    const first = readFileSync(f.schema, "utf8");
    f.write("example.ts", "export interface Example { value: string; }");
    expect(runSchemas(flags(["--check"]), options)).toBe(1);
    expect(runSchemas(flags(), options)).toBe(1);
    expect(readFileSync(f.schema, "utf8")).toBe(first);
    rmSync(path.join(f.root, "src/example.ts"));
    expect(runSchemas(flags(["--check"]), options)).toBe(1);
    rmSync(f.schema);
    expect(runSchemas(flags(["--check"]), options)).toBe(1);
  } finally {
    f.cleanup();
  }
});
