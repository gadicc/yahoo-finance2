import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { projectIt as test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { fixVersions } from "./fix_versions.ts";
import { repository } from "./build_npm.ts";

test("version compatibility command rejects missing, invalid, duplicate and unknown arguments", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-version-invalid-"));
  try {
    const output = join(scratch, "package");
    for (const args of [[], ["--version"], ["--version", "invalid", "--out-dir", output], ["--version", "1.2.3", "--version", "2.3.4"], ["--unknown", "value"]]) {
      expect(() => fixVersions(args), args.join(" ")).toThrow();
    }
    expect(existsSync(output)).toBe(false);
    const imported = spawnSync(process.execPath, ["-e", `await import(${JSON.stringify(new URL("./fix_versions.ts", import.meta.url).href)})`], { cwd: scratch, encoding: "utf8" });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout).toBe("");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("version compatibility command rebuilds package and both metadata versions together", () => {
  const scratch = mkdtempSync(join(tmpdir(), "yf-version-build-"));
  const metadata = readFileSync(join(repository, "deno.json"), "utf8");
  try {
    const output = join(scratch, "package");
    expect(fixVersions(["--version", "9.8.7-compat.1", "--out-dir", output])).toBe(output);
    for (const file of ["package.json", "esm/deno.json", "script/deno.json"]) {
      expect(JSON.parse(readFileSync(join(output, file), "utf8")).version).toBe("9.8.7-compat.1");
    }
    expect(existsSync(join(output, "esm/deno.js"))).toBe(false);
    expect(readFileSync(join(repository, "deno.json"), "utf8")).toBe(metadata);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}, 30_000);
