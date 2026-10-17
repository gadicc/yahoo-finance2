import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "../tests/helpers/runner.ts";
import { expect } from "../tests/helpers/assertions.ts";
import {
  main,
  parseOptions,
  portableRelative,
  resultsOutsideCheckout,
  validateNativeCoverage,
  verificationToolVersions,
} from "./native-platform.ts";

test("verification tools follow exact root pins and reject floating or missing versions", () => {
  const root = mkdtempSync(join(tmpdir(), "yf-tool-pins-"));
  const devDependencies = {
    "@biomejs/biome": "3.1.2",
    typescript: "7.2.3",
    "@types/node": "26.3.4",
  };
  const write = (dependencies: object) =>
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ devDependencies: dependencies }),
    );
  try {
    write(devDependencies);
    expect(verificationToolVersions(root)).toEqual({
      biome: "3.1.2",
      typescript: "7.2.3",
      nodeTypes: "26.3.4",
    });
    for (const name of Object.keys(devDependencies)) {
      for (const version of [
        "^1.2.3",
        "~1.2.3",
        "latest",
        "1.2.3-beta.1",
        "01.2.3",
        "1.2",
        123,
        null,
        undefined,
      ]) {
        write({ ...devDependencies, [name]: version });
        expect(() => verificationToolVersions(root)).toThrow(
          `Root devDependency ${name} must be an exact stable version`,
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native platform options require explicit phases, paths and actual OS", () => {
  expect(() => parseOptions([])).toThrow("Usage");
  expect(() => parseOptions(["replay", "--results", "relative"])).toThrow(
    "absolute",
  );
  expect(() =>
    parseOptions(["replay", "--results", tmpdir(), "--live", "yes"]),
  ).toThrow("Invalid");
  expect(() =>
    parseOptions(["replay", "--results", tmpdir(), "--results", tmpdir()]),
  ).toThrow("Invalid");
  expect(() =>
    parseOptions([
      "replay",
      "--results",
      tmpdir(),
      "--expected-os",
      "different",
    ]),
  ).toThrow("Actual runner OS");
  expect(
    parseOptions([
      "replay",
      "--results",
      tmpdir(),
      "--expected-os",
      process.platform,
    ]).phase,
  ).toBe("replay");
});

test("portable path assertions preserve format checks and refuse escapes", () => {
  const root = join(tmpdir(), "source root");
  expect(portableRelative(root, join(root, "script", "src", "index.js"))).toBe(
    "script/src/index.js",
  );
  expect(() => portableRelative(root, join(root, "..", "outside.js"))).toThrow(
    "outside",
  );
  expect(() => portableRelative(root, root)).toThrow("outside");
});

test("results policy accepts cross-volume trees and rejects checkout overlaps", () => {
  const checkout = String.raw`D:\a\repo\repo`;
  for (const results of [
    String.raw`C:\Users\runner\AppData\Local\Temp\results`,
    String.raw`D:\a\_temp\results`,
    String.raw`D:\a\repo\repo-sibling\results`,
    String.raw`\\server\share\results`,
  ])
    expect(resultsOutsideCheckout(checkout, results, win32)).toBe(true);
  for (const results of [
    checkout,
    String.raw`d:\A\REPO\REPO`,
    String.raw`D:\a\repo\repo\results`,
    String.raw`D:\a\repo`,
    "D:\\",
    String.raw`C:relative`,
  ])
    expect(resultsOutsideCheckout(checkout, results, win32)).toBe(false);
  expect(
    resultsOutsideCheckout(
      String.raw`\\server\share\repo`,
      String.raw`\\server\share`,
      win32,
    ),
  ).toBe(false);
  expect(
    resultsOutsideCheckout(
      String.raw`\\server\share\repo`,
      String.raw`\\other\share\results`,
      win32,
    ),
  ).toBe(true);
  expect(
    resultsOutsideCheckout("/checkout/repo", "/outside/results", posix),
  ).toBe(true);
  for (const result of [
    "/checkout/repo",
    "/checkout/repo/results",
    "/checkout",
    "/",
    "relative",
  ])
    expect(resultsOutsideCheckout("/checkout/repo", result, posix)).toBe(false);
});

test("actual results validation refuses overlap before ownership and retains ownership checks", async () => {
  const checkout = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
  for (const results of [
    checkout,
    join(checkout, "new-results"),
    dirname(checkout),
    dirname(dirname(checkout)),
  ]) {
    await expect(main({ phase: "replay", results })).rejects.toThrow(
      "without overlap",
    );
  }
  expect(existsSync(join(checkout, "new-results"))).toBe(false);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "yf-results-policy-")));
  try {
    writeFileSync(join(root, "unowned.txt"), "preserve");
    await expect(main({ phase: "replay", results: root })).rejects.toThrow(
      "Refusing unowned",
    );
    expect(readFileSync(join(root, "unowned.txt"), "utf8")).toBe("preserve");
    expect(existsSync(join(root, "owner.txt"))).toBe(false);
    const outside = join(root, "owned");
    await expect(main({ phase: "replay", results: outside })).rejects.toThrow(
      "Clean install must pass first",
    );
    expect(readFileSync(join(outside, "owner.txt"), "utf8")).toBe(
      "yahoo-finance2/native-platform-v1\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native coverage rejects empty, outside, stale, duplicate and partial reports", () => {
  const root = mkdtempSync(join(tmpdir(), "yf-native-coverage-"));
  const names = [
    "src/lib/runtime-detect.ts",
    "src/modules/quote.ts",
    "src/modules/chart.ts",
    "src/modules/quoteSummary-iface.ts",
  ];
  try {
    for (const name of names) {
      const path = join(root, name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "export const value=1;\n");
    }
    const record = (name: string) =>
      `TN:\nSF:${name}\nFNF:1\nFNH:1\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`;
    const complete = names.map(record).join("");
    expect(validateNativeCoverage(complete, root)).toEqual([...names].sort());
    expect(() => validateNativeCoverage("", root)).toThrow("Empty");
    expect(() => validateNativeCoverage(record("../outside.ts"), root)).toThrow(
      "outside",
    );
    expect(() =>
      validateNativeCoverage(record("src/stale.ts"), root),
    ).toThrow();
    expect(() =>
      validateNativeCoverage(complete + record(names[0]), root),
    ).toThrow("Duplicate");
    expect(() => validateNativeCoverage(record(names[0]), root)).toThrow(
      "Missing",
    );
    expect(() =>
      validateNativeCoverage(complete.replace("DA:1,1", "DA:999,1"), root),
    ).toThrow();
    expect(() =>
      validateNativeCoverage(complete.replace("end_of_record\n", ""), root),
    ).toThrow("Unterminated");
    const invalid = [
      complete.replace(/(?:FNF|FNH|DA|LF|LH):[^\n]*\n/g, ""),
      complete.replace("DA:1,1\n", "DA:1,1\nDA:1,1\n"),
      complete.replace("DA:1,1", "DA:2,1"), // No phantom line after final LF.
      complete.replace("DA:1,1", "DA:0,1"),
      complete.replace("DA:1,1", "DA:01,1"),
      complete.replace("DA:1,1", "DA:1,-1"),
      complete.replace("DA:1,1", "DA:1,NaN"),
      complete.replace("DA:1,1", "DA:1,Infinity"),
      complete.replace("DA:1,1", "DA:1,9007199254740992"),
      complete.replace("DA:1,1", "DA:9007199254740992,1"),
      complete.replace("LF:1", "LF:0"),
      complete.replace("LH:1", "LH:0"),
      complete.replace("FNH:1", "FNH:2"),
      complete.replace("FNF:1", "FNF:9007199254740992"),
      complete.replace("LF:1", "LF:1.5"),
      complete.replace("LH:1", "LH:-1"),
      complete.replace("FNF:1", "FNF:1:2"),
      complete.replace("LF:1\n", "LF:1\nLF:1\n"),
      complete.replace("FNF:1\n", "FNF:1\nFNF:1\n"),
      complete.replace("TN:\nSF:", "TN:named\nSF:"),
      complete.replace("LF:1", "FN:1,native"),
      complete.replace("LF:1", "BRF:0"),
      complete + "TN:\n",
      "DA:1,1\n" + complete,
      "LF:1\n" + complete,
      complete.replace("SF:src/", "SF:src/../src/"),
    ];
    for (const field of ["LF", "LH", "FNF", "FNH"])
      invalid.push(complete.replace(new RegExp(`${field}:1\\n`), ""));
    for (const report of invalid)
      expect(() => validateNativeCoverage(report, root)).toThrow();
    expect(
      validateNativeCoverage(complete.replaceAll("\n", "\r\n"), root),
    ).toEqual([...names].sort());
    const zeroHits = complete
      .replaceAll("DA:1,1", "DA:1,0")
      .replaceAll("LH:1", "LH:0")
      .replaceAll("FNH:1", "FNH:0");
    expect(validateNativeCoverage(zeroHits, root)).toEqual([...names].sort());
    for (const ending of ["\r\n", ""]) {
      for (const name of names)
        writeFileSync(join(root, name), `export const value=1;${ending}`);
      expect(validateNativeCoverage(complete, root)).toEqual([...names].sort());
      expect(() =>
        validateNativeCoverage(complete.replace("DA:1,1", "DA:2,1"), root),
      ).toThrow("physical");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
