import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixtureChanges, snapshotFixtures, readFixtureBytes } from "./recache-fixtures.ts";

test("recache fixture report separates run changes from preexisting edits", () => {
  const before = new Map([
    ["preexisting-local-edit.json", "already-edited"],
    ["updated.json", "old"],
    ["removed.json", "removed"],
  ]);
  const after = new Map([
    ["preexisting-local-edit.json", "already-edited"],
    ["updated.json", "new"],
    ["added.json", "added"],
  ]);
  expect(fixtureChanges(before, after)).toEqual([
    "added: added.json",
    "removed: removed.json",
    "updated: updated.json",
  ]);
  expect(before.get("updated.json")).toBe("old");
});


test("portable recache snapshot compares current bytes and excludes symlink aliases", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "yf-snapshot-"));
  try {
    const root = join(temporary, "fixtures");
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "local.json"), "already edited before this run");
    await writeFile(join(root, "nested", "updated.json"), "old");
    await writeFile(join(root, "removed.json"), "removed");
    await writeFile(join(temporary, "outside.json"), "outside");
    await symlink(join(temporary, "outside.json"), join(root, "alias.json"));
    await symlink(temporary, join(root, "directory-alias"));
    await writeFile(join(root, "ignored.txt"), "not a fixture");
    const before = await snapshotFixtures(root);
    expect(before.size).toBe(3);
    await writeFile(join(root, "nested", "updated.json"), "new");
    await rm(join(root, "removed.json"));
    await writeFile(join(root, "added.json"), "new");
    await writeFile(join(temporary, "outside.json"), "outside changed");
    expect(fixtureChanges(before, await snapshotFixtures(root))).toEqual([
      `added: ${join(root, "added.json")}`,
      `updated: ${join(root, "nested", "updated.json")}`,
      `removed: ${join(root, "removed.json")}`,
    ]);
    await symlink(root, join(temporary, "root-alias"));
    await expect(snapshotFixtures(join(temporary, "root-alias"))).rejects.toThrow("symlink");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("capture reads refuse symlinks, nonregular files and hardlink publication aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-fixture-read-"));
  try {
    const fixture = join(root, "fixture.json");
    await writeFile(fixture, "original");
    expect((await readFixtureBytes(fixture, true)).toString()).toBe("original");
    await symlink(fixture, join(root, "symlink.json"));
    await expect(readFixtureBytes(join(root, "symlink.json"), true)).rejects.toThrow();
    await expect(readFixtureBytes(root, true)).rejects.toThrow();
    await symlink(root, join(root, "directory-alias"));
    await expect(readFixtureBytes(join(root, "directory-alias", "fixture.json"), true))
      .rejects.toThrow("symlink");
    await link(fixture, join(root, "hardlink.json"));
    await expect(readFixtureBytes(fixture, true)).rejects.toThrow("unaliased");
    expect((await readFixtureBytes(fixture)).toString()).toBe("original");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
