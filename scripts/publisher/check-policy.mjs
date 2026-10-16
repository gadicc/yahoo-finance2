/** Pure release analysis, never credentials, tags, publication or Deno. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import config from "../../release.config.mjs";

const require = createRequire(import.meta.url);
const { analyzeCommits } = await import(
  pathToFileURL(require.resolve("@semantic-release/commit-analyzer")).href
);
const { generateNotes } = await import(
  pathToFileURL(require.resolve("@semantic-release/release-notes-generator"))
    .href
);
const semanticRoot = dirname(require.resolve("semantic-release"));
const { default: nextVersion } = await import(
  pathToFileURL(join(semanticRoot, "lib/get-next-version.js")).href
);
const normal = await import(
  pathToFileURL(join(semanticRoot, "lib/branches/normalize.js")).href
);
const logger = { log() {} };
const breaking = {
  hash: "1111111",
  message:
    "feat(runtime)!: migrate development and require modern consumers\n\nBREAKING CHANGE: Development requires Bun 1.4.3 and Linux strict CI or explicit trusted native replay. Consumers require Node >=22 or Bun >=1.4.3; Deno >=2.0 and JSR distribution remain supported.",
};
const commits = [
  breaking,
  { hash: "2222222", message: "fix(quote): preserve result validation" },
];
const type = await analyzeCommits(
  { preset: config.preset },
  { cwd: process.cwd(), commits, logger },
);
assert.equal(type, "major");
assert.deepEqual(
  config.branches,
  [
    "+([0-9])?(.{+([0-9]),x}).x",
    "master",
    "main",
    "next",
    "next-major",
    { name: "beta", prerelease: true },
    { name: "alpha", prerelease: true },
  ],
  "Existing release branches/channels must remain unchanged",
);
const examples = [];
for (const available of [
  ["main", "next", "next-major"],
  ["master", "next", "next-major"],
  ["master", "main", "next", "next-major"],
]) {
  const stable = normal.release({
    release: config.branches
      .filter((name) => typeof name === "string" && available.includes(name))
      .map((name) => ({ name, tags: [] })),
  });
  const prereleases = normal.prerelease({
    prerelease: config.branches
      .filter((branch) => typeof branch === "object")
      .map((branch) => ({ ...branch, tags: [] })),
  });
  for (const branch of [...stable, ...prereleases]) {
    /** @type {string} */
    const next = nextVersion({
      branch,
      nextRelease: { type, channel: branch.channel },
      lastRelease: { version: "4.2.0", channels: [null] },
      logger,
    });
    assert.equal(
      next,
      branch.type === "prerelease" ? `5.0.0-${branch.name}.1` : "5.0.0",
    );
    assert.equal(
      branch.channel,
      branch.name === available[0] ? undefined : branch.name,
    );
    examples.push({
      available,
      branch: branch.name,
      channel: branch.channel ?? "default",
      version: next,
    });
  }
}
const notes = await generateNotes(
  { preset: config.preset },
  {
    cwd: process.cwd(),
    commits,
    lastRelease: { gitTag: "v4.2.0" },
    nextRelease: { version: "5.0.0", gitTag: "v5.0.0" },
    options: { repositoryUrl: config.repositoryUrl },
  },
);
assert.match(notes, /BREAKING CHANGES/);
assert.match(notes, /Node >=22/);
assert.match(notes, /Bun >=1\.4\.3/);
assert.match(notes, /Deno >=2\.0/);
assert.match(notes, /Bug Fixes/);
console.log(
  JSON.stringify(
    {
      releaseType: type,
      examples,
      notes,
      scope:
        "Pure real commit-analyzer/writer/semantic-release version and channel functions; no Git refs, auth, registry, Deno or publish hooks",
    },
    null,
    2,
  ),
);
