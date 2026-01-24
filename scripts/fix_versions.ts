import { parseArgs } from "@std/cli/parse-args";

const args = parseArgs(Deno.args, {
  string: ["version"],
});

const version = args.version;

if (!version) {
  throw new Error("--version is required");
}

console.log("Building version", version);

function updateFile(filePath: string, updateFn: (text: string) => string) {
  const text = Deno.readTextFileSync(filePath);
  const updatedText = updateFn(text);
  Deno.writeTextFileSync(filePath, updatedText);
}

for (
  const denoJs of [
    "npm/src/deno.js",
    "npm/esm/deno.js",
    "npm/script/deno.js",
  ]
) {
  updateFile(denoJs, (text) => {
    // A little brittle but works for now.
    // TODO, make sure we're inside an "export default {...}" block.
    return text.replace(
      /^(\s+)"version":\s*".*",$/m,
      `$1"version": "${version}",`,
    );
  });
}
