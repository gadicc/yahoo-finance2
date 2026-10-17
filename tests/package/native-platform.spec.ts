/** Explicit native-job proof; not part of the guarded .test.ts inventory. */
import assert from "node:assert/strict";
import { test } from "bun:test";
import { main, parseOptions } from "../../scripts/native-platform.ts";

const input = process.env.YF_NATIVE_PROOF_ARGS;
assert(
  input && input.length <= 32768,
  "Explicit bounded native proof arguments are required",
);
const args: unknown = JSON.parse(input);
assert(
  Array.isArray(args) &&
    args.every((value) => typeof value === "string" && value.length <= 4096),
  "Native proof arguments must be bounded strings",
);
assert(
  ["install", "replay", "package"].includes(args[0]),
  "Only explicit native install/replay/package phases can be instrumented",
);
const options = parseOptions(args);

test(`actual native ${options.phase} proof`, async () => {
  await main(options);
}, 1800000);
