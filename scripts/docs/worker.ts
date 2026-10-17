import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inputDigest } from "../docs.ts";
import { generateModel, warningDelta, type Diagnostic } from "./model.ts";

const [root, output, expectedFingerprint] = process.argv.slice(2);
if (!root || !output || !expectedFingerprint || process.argv.length !== 5)
  throw new Error("Internal documentation worker arguments");
const fingerprint = inputDigest(root);
if (fingerprint !== expectedFingerprint)
  throw new Error(
    "Documentation worker input fingerprint differs from launcher",
  );
const report = await generateModel(root, output, fingerprint);
if (inputDigest(root) !== fingerprint)
  throw new Error("Documentation worker inputs changed during generation");
const baseline = JSON.parse(
  readFileSync(resolve(root, "scripts/docs/diagnostics-baseline.json"), "utf8"),
) as Diagnostic[];
const compatibility = JSON.parse(
  readFileSync(resolve(root, "scripts/docs/parser-compatibility.json"), "utf8"),
) as Diagnostic[];
const delta = warningDelta(report.diagnostics, [...baseline, ...compatibility]);
writeFileSync(
  resolve(output, "diagnostic-delta.json"),
  `${JSON.stringify(delta, null, 2)}\n`,
);
if (delta.added.length) {
  for (const item of delta.added)
    console.error(`[docs] NEW (${item.count}) ${item.message}`);
  throw new Error(
    "New documentation diagnostics; fix the source or review a precise baseline change",
  );
}
console.log(
  `[docs] ${report.coverage.length} exports, ${report.reflectionCount} reflections, ` +
    `${report.normalizedLinks.length} compatible links; ${report.diagnostics.length} existing diagnostics, ` +
    `${delta.resolved.reduce((sum, item) => sum + item.count, 0)} resolved`,
);
