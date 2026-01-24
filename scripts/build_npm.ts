import { build, emptyDir } from "@deno/dnt";
import { parseArgs } from "@std/cli/parse-args";
import denoJson from "../deno.json" with { type: "json" };

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

await emptyDir("./npm");

await build({
  scriptModule: "cjs",
  entryPoints: [
    ...Object.entries(denoJson.exports).map(([name, path]) => ({
      name,
      path,
    })),
    {
      kind: "bin",
      name: "yahoo-finance",
      path: "./bin/yahoo-finance.ts",
    },
  ],
  outDir: "./npm",
  test: false,
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  package: {
    // package.json properties
    name: "yahoo-finance2",
    // version: Deno.args[0],
    version,
    description: "JS API for Yahoo Finance",
    author: "Gadi Cohen <dragon@wastelands.net>",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/gadicc/yahoo-finance2.git",
    },
    bugs: {
      url: "https://github.com/gadicc/yahoo-finance2/issues",
    },
    keywords: [
      "yahoo",
      "finance",
      "financial",
      "data",
      "stock",
      "price",
      "quote",
      "historical",
      "eod",
      "end-of-day",
      "client",
      "library",
    ],
    "engines": {
      "node": ">=20.0.0",
    },
    dependencies: {
      "tough-cookie": denoJson.imports["tough-cookie"],
      "tough-cookie-file-store": denoJson.imports["tough-cookie-file-store"],
      "fetch-mock-cache": denoJson.imports["fetch-mock-cache"],
    },
  },
  // importMap: "deno.json",

  // until we can solve @namespace/imports from jsr.  mappings don't work.
  typeCheck: false,

  postBuild() {
    // steps to run after building and before running the tests
    Deno.chmodSync("npm/esm/bin/yahoo-finance.js", 0o755);
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
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
  },
});
