import { build, emptyDir } from "@deno/dnt";
import denoJson from "../deno.json" with { type: "json" };

function copyDirectorySync(from: string, to: string) {
  Deno.mkdirSync(to, { recursive: true });

  for (const entry of Deno.readDirSync(from)) {
    const source = `${from}/${entry.name}`;
    const target = `${to}/${entry.name}`;

    if (entry.isDirectory) {
      copyDirectorySync(source, target);
    } else if (entry.isFile) {
      Deno.copyFileSync(source, target);
    }
  }
}

function addPackageBinAlias(packageJsonPath: string) {
  const packageJson = JSON.parse(Deno.readTextFileSync(packageJsonPath));
  packageJson.bin = {
    // npm exec/npx can infer a package command when a bin matches the package name.
    "yahoo-finance2": "./esm/bin/yahoo-finance.js",
    ...packageJson.bin,
  };
  Deno.writeTextFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

const mcpSdkSpecifier = denoJson.imports[
  "@modelcontextprotocol/sdk/client/index.js"
].replace(/\/client\/index\.js$/, "");

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
    {
      kind: "bin",
      name: "yahoo-finance-mcp",
      path: "./bin/yahoo-finance-mcp.ts",
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
    version: "0.0.1", // will be replaced on publish
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
      "agent-skill",
      "mcp-server",
    ],
    "engines": {
      "node": ">=22.0.0",
    },
    dependencies: {
      "tough-cookie": denoJson.imports["tough-cookie"],
      "tough-cookie-file-store": denoJson.imports["tough-cookie-file-store"],
      "fetch-mock-cache": denoJson.imports["fetch-mock-cache"],
      "@modelcontextprotocol/sdk": mcpSdkSpecifier,
      "zod": denoJson.imports["zod"],
    },
  },
  // importMap: "deno.json",

  // until we can solve @namespace/imports from jsr.  mappings don't work.
  typeCheck: false,

  postBuild() {
    // steps to run after building and before running the tests
    addPackageBinAlias("npm/package.json");
    Deno.chmodSync("npm/esm/bin/yahoo-finance.js", 0o755);
    Deno.chmodSync("npm/esm/bin/yahoo-finance-mcp.js", 0o755);
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
    copyDirectorySync("skills", "npm/skills");
  },
});
