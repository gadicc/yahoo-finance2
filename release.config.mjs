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
    // semantic-release v25 does not accept the JSR package's pure named ESM
    // export object directly, so this wrapper default-exports lifecycle hooks.
    "./scripts/semantic-release-jsr.mjs",
    "@semantic-release/github",
  ],
  // Keep the preset dependency in deno.json below v10 while semantic-release
  // uses conventional-changelog-writer v8. The preset's v10 render-function
  // interface is incompatible with writer v8 and silently produces only the
  // release heading, as happened for v4.0.0 and v4.0.1. Upgrade only after
  // upstream support lands and `deno task release:check-notes` still passes:
  // https://github.com/semantic-release/release-notes-generator/issues/992
  // https://github.com/semantic-release/release-notes-generator/pull/996
  preset: "conventionalcommits",
  repositoryUrl: "https://github.com/gadicc/yahoo-finance2",
};
