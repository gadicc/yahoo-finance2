import { expect } from "@std/expect";
import { fixtureChanges } from "./recache-fixtures.ts";

Deno.test("recache fixture report separates run changes from preexisting edits", () => {
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
