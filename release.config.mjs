/**
 * @type {import("semantic-release").GlobalConfig}
 */
export default {
  branches: [
    "+([0-9])?(.{+([0-9]),x}).x",
    "master",
    "main",
    "next",
    "next-major",
    {
      name: "beta",
      prerelease: true,
    },
    {
      name: "alpha",
      prerelease: true,
    },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/exec", {
      "prepareCmd":
        "deno run --no-prompt --allow-read=npm/src/deno.js,npm/esm/deno.js,npm/script/deno.js --allow-write=npm/src/deno.js,npm/esm/deno.js,npm/script/deno.js scripts/fix_versions.ts --version ${nextRelease.version}",
    }],
    ["@semantic-release/npm", {
      pkgRoot: "npm",
    }],
    "@sebbo2002/semantic-release-jsr",
    "@semantic-release/github",
  ],
  preset: "conventionalcommits",
  repositoryUrl: "https://github.com/gadicc/yahoo-finance2",
};
