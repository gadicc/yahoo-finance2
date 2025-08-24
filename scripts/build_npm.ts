import { build, emptyDir } from "@deno/dnt";
import denoJson from "../deno.json" with { type: "json" };

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
    version: "0.0.1", // semantic-release will replace this
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
  },
});
