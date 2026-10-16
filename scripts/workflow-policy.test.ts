import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import releaseConfig from "../release.config.mjs";
import { isAllowedWorkflowRef } from "./workflow-policy.mjs";

test("release policy accepts configured named and maintenance branches", () => {
  for (
    const branch of [
      "main",
      "master",
      "next",
      "next-major",
      "alpha",
      "beta",
      "1.x",
      "2.x",
      "10.x",
      "1.2.x",
      "1.x.x",
    ]
  ) {
    expect(isAllowedWorkflowRef("release", `refs/heads/${branch}`)).toBe(true);
  }
});

test("release policy rejects tags, nonrelease refs, and maintenance lookalikes", () => {
  for (
    const ref of [
      "refs/heads/dev",
      "refs/heads/feature/example",
      "refs/heads/feature/main",
      "refs/heads/main/extra",
      "refs/heads/main\n",
      "refs/heads/Main",
      "refs/heads/v1.x",
      "refs/heads/1x",
      "refs/heads/x.x",
      "refs/heads/1.2.3.x",
      "refs/heads/1..x",
      "refs/heads/1.X",
      "refs/heads/1.x-extra",
      "refs/heads/1.2",
      "refs/heads/1.2.3",
      "refs/tags/main",
      "refs/tags/1.x",
      "refs/tags/v1.2.3",
      "refs/pull/1/merge",
      "main",
      "refs/heads/",
      "",
    ]
  ) {
    expect(isAllowedWorkflowRef("release", ref)).toBe(false);
  }
});

test("release policy follows additions and removals in the configured allowlist", () => {
  if (!Array.isArray(releaseConfig.branches)) {
    throw new Error("Expected an array of configured release branches");
  }
  const branches = [...releaseConfig.branches, "stable", {
    name: "preview/canary",
  }];
  expect(isAllowedWorkflowRef("release", "refs/heads/stable", branches)).toBe(
    true,
  );
  expect(isAllowedWorkflowRef("release", "refs/heads/preview/canary", branches))
    .toBe(true);
  expect(isAllowedWorkflowRef("release", "refs/heads/main", ["stable"]))
    .toBe(false);
  expect(isAllowedWorkflowRef("release", "refs/heads/1.x", ["stable"]))
    .toBe(false);
});

test("unsupported release config entries invalidate the complete allowlist", () => {
  for (
    const entry of [
      "*",
      "release/*",
      "1.x*",
      "+([0-9]).x",
      "[12].x",
      "{main,master}",
      "!dev",
      "",
      "main\n",
      "main..next",
      "main/.hidden",
      "main.lock",
      null,
      undefined,
      1,
      [],
      {},
      { name: "*", prerelease: true },
      { name: 1 },
    ]
  ) {
    expect(isAllowedWorkflowRef("release", "refs/heads/main", ["main", entry]))
      .toBe(false);
  }
  for (const branches of [null, {}, "main", []]) {
    expect(isAllowedWorkflowRef("release", "refs/heads/main", branches))
      .toBe(false);
  }
});

test("recache policy permits only the full dev branch ref", () => {
  expect(isAllowedWorkflowRef("recache", "refs/heads/dev")).toBe(true);
  for (
    const ref of [
      "dev",
      "refs/heads/main",
      "refs/heads/1.x",
      "refs/heads/feature/dev",
      "refs/heads/dev/extra",
      "refs/heads/Dev",
      "refs/heads/dev\n",
      "refs/tags/dev",
      "refs/pull/1/merge",
      "",
    ]
  ) {
    expect(isAllowedWorkflowRef("recache", ref)).toBe(false);
  }
});

test("unknown workflow kinds and nonstring refs fail closed", () => {
  expect(isAllowedWorkflowRef("tests", "refs/heads/main")).toBe(false);
  expect(isAllowedWorkflowRef(undefined, "refs/heads/main")).toBe(false);
  for (const ref of [undefined, null, 1, {}, []]) {
    expect(isAllowedWorkflowRef("release", ref)).toBe(false);
    expect(isAllowedWorkflowRef("recache", ref)).toBe(false);
  }
});
