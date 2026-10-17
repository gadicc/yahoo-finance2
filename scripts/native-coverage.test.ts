import { createHash } from "node:crypto";
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
import { join } from "node:path";
import { projectIt as test } from "../tests/helpers/runner.ts";
import { expect } from "../tests/helpers/assertions.ts";
import { sealNativeCoverage } from "./native-coverage.mjs";

const phases = ["install", "replay", "package"];
const sources = [
  "scripts/native-platform.ts",
  "scripts/testing/native.ts",
  "src/lib/runtime-detect.ts",
  "src/lib/runtimeGlobal.ts",
  "tests/package/native-platform.spec.ts",
];
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "yf-native-seal-"));
  const root = join(parent, "repo"),
    results = join(parent, "results");
  mkdirSync(results);
  for (const name of sources) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), "// controlled source\n");
  }
  writeFileSync(
    join(results, "owner.txt"),
    "yahoo-finance2/native-platform-v1\n",
  );
  for (const phase of phases) {
    mkdirSync(join(results, `proof-${phase}`));
    writeFileSync(
      join(results, `proof-${phase}`, "lcov.info"),
      `controlled raw ${phase}`,
    );
  }
  const env = {
    GITHUB_SHA: "1".repeat(40),
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
  };
  const summary = {
    status: "passed",
    phases: { install: "passed", replay: "passed", package: "passed" },
    github: {
      sha: env.GITHUB_SHA,
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
    },
    proofSourceSha256: Object.fromEntries(
      sources.map((name) => [name, hash(readFileSync(join(root, name)))]),
    ),
  };
  const save = () =>
    writeFileSync(join(results, "summary.json"), JSON.stringify(summary));
  save();
  return {
    root,
    results,
    env,
    summary,
    save,
    [Symbol.dispose]() {
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

test("native sealing binds actual flushed bytes and ordered phase roles without overwriting a receipt", () => {
  using f = fixture();
  for (const phase of phases) {
    const receipt = sealNativeCoverage(phase, f.results, f.root, f.env);
    const bytes = readFileSync(join(f.results, `proof-${phase}`, "lcov.info"));
    expect(receipt).toEqual({
      path: `proof-${phase}/lcov.info`,
      bytes: bytes.length,
      sha256: hash(bytes),
    });
    const before = readFileSync(join(f.results, "summary.json"), "utf8");
    expect(() => sealNativeCoverage(phase, f.results, f.root, f.env)).toThrow(
      "reseal",
    );
    expect(readFileSync(join(f.results, "summary.json"), "utf8")).toBe(before);
  }
  expect(
    Object.keys(
      JSON.parse(readFileSync(join(f.results, "summary.json"), "utf8"))
        .coverageReports,
    ),
  ).toEqual(phases);
});

test("native sealing refuses missing context, out-of-order phases, failed proof and changed source", () => {
  using f = fixture();
  expect(() => sealNativeCoverage("other", f.results, f.root, f.env)).toThrow(
    "Unknown",
  );
  expect(() => sealNativeCoverage("install", f.results, f.root, {})).toThrow(
    "checkout/run/attempt",
  );
  expect(() => sealNativeCoverage("replay", f.results, f.root, f.env)).toThrow(
    "Earlier",
  );
  expect(() => sealNativeCoverage("install", f.root, f.root, f.env)).toThrow(
    "outside",
  );
  expect(() =>
    sealNativeCoverage("install", f.results, f.root, {
      ...f.env,
      GITHUB_RUN_ID: "124",
    }),
  ).toThrow("context changed");
  f.summary.status = "failed";
  f.save();
  expect(() => sealNativeCoverage("install", f.results, f.root, f.env)).toThrow(
    "must have passed",
  );
  f.summary.status = "passed";
  f.save();
  writeFileSync(join(f.root, "scripts/native-platform.ts"), "changed source");
  expect(() => sealNativeCoverage("install", f.results, f.root, f.env)).toThrow(
    "source identity",
  );
});

test("native sealing refuses aliased/empty raw files and preserves an existing transaction file", () => {
  using f = fixture();
  const report = join(f.results, "proof-install/lcov.info");
  rmSync(report);
  symlinkSync(join(f.root, "scripts/native-platform.ts"), report);
  expect(() => sealNativeCoverage("install", f.results, f.root, f.env)).toThrow(
    "canonical",
  );
  rmSync(report);
  writeFileSync(report, "");
  expect(() => sealNativeCoverage("install", f.results, f.root, f.env)).toThrow(
    "Empty",
  );
  writeFileSync(report, "valid controlled bytes");
  const temporary = join(f.results, ".coverage-seal-install.json");
  writeFileSync(temporary, "preserve earlier evidence");
  expect(() =>
    sealNativeCoverage("install", f.results, f.root, f.env),
  ).toThrow();
  expect(readFileSync(temporary, "utf8")).toBe("preserve earlier evidence");
  expect(existsSync(join(f.results, "summary.json"))).toBe(true);
});
