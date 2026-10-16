import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { fixtureChanges } from "./recache-fixtures.ts";

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
