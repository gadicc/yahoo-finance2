/**
 * @satisfies {Partial<import("semantic-release").GlobalConfig>}
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
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release/exec interpolates the release version.
          "bun scripts/fix_versions.ts --version ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/npm",
      {
        pkgRoot: "npm",
      },
    ],
    // semantic-release v25 does not accept the JSR package's pure named ESM
    // export object directly, so this wrapper default-exports lifecycle hooks.
    "./scripts/semantic-release-jsr.mjs",
    "@semantic-release/github",
  ],
  // Keep the root preset dependency below v10 while semantic-release
  // uses conventional-changelog-writer v8. The preset's v10 render-function
  // interface is incompatible with writer v8 and silently produces only the
  // release heading, as happened for v4.0.0 and v4.0.1. Upgrade only after
  // upstream support lands and `node scripts/check-release-notes.mjs` still passes:
  // https://github.com/semantic-release/release-notes-generator/issues/992
  // https://github.com/semantic-release/release-notes-generator/pull/996
  preset: "conventionalcommits",
  repositoryUrl: "https://github.com/gadicc/yahoo-finance2",
};
