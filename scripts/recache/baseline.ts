import { parseArguments, runTests } from "../test.ts";

// Internal subprocess entry. Public capture commands never expose a root option.
const [root, ...files] = process.argv.slice(2);
if (!root || !files.length)
  throw new Error("Missing capture baseline selection");
process.exitCode = await runTests(parseArguments(["--serial", ...files]), root);
