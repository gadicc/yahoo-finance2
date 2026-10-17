import { parseArguments, runTests, type TestOptions } from "../test.ts";

/** Internal subprocess entry; the public capture CLI cannot select a root. */
export async function runBaseline(
  args: string[],
  run: (options: TestOptions, root: string) => Promise<number> = runTests,
): Promise<number> {
  const [root, timeout, ...files] = args;
  if (!root || !timeout || !files.length)
    throw new Error("Missing capture baseline selection or timeout");
  return await run(
    parseArguments(["--serial", "--run-timeout", timeout, "--", ...files]),
    root,
  );
}

if (import.meta.main)
  process.exitCode = await runBaseline(process.argv.slice(2));
