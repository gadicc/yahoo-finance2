import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "../tests/helpers/assertions.ts";
import { test } from "../tests/helpers/runner.ts";
import { publishStage, stageFixtures } from "./recache/staging.ts";

const fixture = (value: unknown, status = 200) =>
  JSON.stringify({
    request: { url: "https://query2.finance.yahoo.com/v7/finance/quote" },
    response: { status, ok: status === 200, bodyJson: value },
  });

test("capture stages current local bytes privately and atomically publishes only valid changed captures", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-publish-"));
  try {
    const originals = join(root, "originals");
    const scratch = join(root, "scratch");
    await mkdir(originals);
    await mkdir(scratch, { mode: 0o700 });
    await writeFile(
      join(originals, "local.json"),
      fixture({ earlierLocalEdit: true }),
    );
    await writeFile(join(originals, "updated.json"), fixture({ old: true }));
    const stage = await stageFixtures(originals, scratch);
    expect((await stat(stage.fixtureRoot)).mode & 0o777).toBe(0o700);
    expect(
      (await stat(join(stage.fixtureRoot, "local.json"))).mode & 0o777,
    ).toBe(0o600);
    await writeFile(
      join(stage.fixtureRoot, "updated.json"),
      fixture({ changed: true }),
    );
    await writeFile(
      join(stage.fixtureRoot, "added.json"),
      fixture({ added: true }),
    );
    await writeFile(
      join(stage.fixtureRoot, "transient.json"),
      fixture({ error: "unavailable" }, 503),
    );
    const result = await publishStage(stage);
    expect(result).toEqual({ published: 2, rejected: ["server-error"] });
    expect(
      JSON.parse(await readFile(join(originals, "local.json"), "utf8")).response
        .bodyJson,
    ).toEqual({ earlierLocalEdit: true });
    expect((await readdir(originals)).sort()).toEqual([
      "added.json",
      "local.json",
      "updated.json",
    ]);
    expect((await publishStage(stage)).published).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("capture publication refuses changed local files, symlink/hardlink aliases, removals and protected fixture ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-publish-"));
  try {
    const originals = join(root, "originals");
    const scratch = join(root, "scratch");
    await mkdir(originals);
    await mkdir(scratch);
    for (const name of [
      "local.json",
      "deleted.json",
      "file.static.json",
      "file.fake.json",
      "getCrumb-geo-gb-20261016-getcrumb.json",
    ]) {
      await writeFile(join(originals, name), fixture({ original: true }));
    }
    const stage = await stageFixtures(originals, scratch);
    await writeFile(
      join(originals, "local.json"),
      fixture({ editedDuringCapture: true }),
    );
    for (const name of [
      "local.json",
      "file.static.json",
      "file.fake.json",
      "getCrumb-geo-gb-20261016-getcrumb.json",
    ]) {
      await writeFile(
        join(stage.fixtureRoot, name),
        fixture({ replacement: true }),
      );
    }
    await rm(join(stage.fixtureRoot, "deleted.json"));
    await writeFile(
      join(stage.fixtureRoot, "hardlink.json"),
      fixture({ aliased: true }),
    );
    await link(
      join(stage.fixtureRoot, "hardlink.json"),
      join(root, "external-alias"),
    );
    const result = await publishStage(stage);
    expect(result.published).toBe(0);
    expect(result.rejected).toContain("fixture-removal");
    expect(result.rejected).toContain("unsafe-staged-fixture");
    expect(result.rejected).toContain("local-fixture-changed");
    expect(
      result.rejected.filter((reason) => reason === "protected-fixture"),
    ).toHaveLength(3);
    expect(
      JSON.parse(await readFile(join(originals, "local.json"), "utf8")).response
        .bodyJson,
    ).toEqual({ editedDuringCapture: true });
    const external = join(root, "external.json");
    await writeFile(external, fixture({ protected: true }));
    await symlink(external, join(originals, "symlink.json"));
    await writeFile(
      join(stage.fixtureRoot, "symlink.json"),
      fixture({ overwrite: true }),
    );
    expect((await publishStage(stage)).rejected).toContain(
      "local-fixture-changed",
    );
    expect(
      JSON.parse(await readFile(external, "utf8")).response.bodyJson,
    ).toEqual({ protected: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
