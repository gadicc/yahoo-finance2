import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Resolve the generator through semantic-release so this check exercises the
// exact transitive writer version that will run during publication.
const require = createRequire(import.meta.url);
const requireFromSemanticRelease = createRequire(
  require.resolve("semantic-release"),
);
const generatorPath = requireFromSemanticRelease.resolve(
  "@semantic-release/release-notes-generator",
);
const { generateNotes } = await import(generatorPath);

const notes = await generateNotes(
  { preset: "conventionalcommits" },
  {
    commits: [
      { hash: "1111111", message: "feat(api): add a feature" },
      { hash: "2222222", message: "fix(quote): repair a bug" },
    ],
    lastRelease: { gitTag: "v1.0.0" },
    nextRelease: { version: "1.1.0", gitTag: "v1.1.0" },
    options: {
      repositoryUrl: "https://github.com/gadicc/yahoo-finance2",
    },
    cwd: process.cwd(),
  },
);

assert.match(notes, /^### Features$/m);
assert.match(notes, /^### Bug Fixes$/m);
assert.match(notes, /add a feature/);
assert.match(notes, /repair a bug/);

console.log("semantic-release generated feature and bug-fix notes");
