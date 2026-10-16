import createFetchCache from "fetch-mock-cache/runtimes/bun.ts";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import { captureStore } from "./recache/store.ts";

test("capture store drains deferred onFinish writes into private staged files", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "yf-store-"));
  try {
    const storage = captureStore({ fixtureRoot, mode: "recache", interval: 0 });
    const cache = createFetchCache({
      Store: storage.Store,
      fetch: async () => Response.json({ observedNewField: 42 }),
    });
    let finish!: (capture: boolean) => void;
    cache.once({
      id: "data-drift",
      readCache: false,
      writeCache: new Promise<boolean>((resolve) => (finish = resolve)),
    });
    expect(
      await (
        await cache("https://query2.finance.yahoo.com/v7/finance/quote", {})
      ).json(),
    ).toEqual({ observedNewField: 42 });
    expect(await readdir(fixtureRoot)).toEqual([]);
    finish(true);
    await storage.drain();
    const fixture = JSON.parse(
      await readFile(join(fixtureRoot, "data-drift.json"), "utf8"),
    );
    expect(fixture.response.bodyJson).toEqual({ observedNewField: 42 });
    cache.once({
      id: "passing",
      readCache: false,
      writeCache: Promise.resolve(false),
    });
    await cache("https://query2.finance.yahoo.com/v7/finance/quote", {});
    await storage.drain();
    expect(await readdir(fixtureRoot)).toEqual(["data-drift.json"]);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("capture store refuses protected ids and transient captures while accepting observed shape drift", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "yf-store-"));
  try {
    for (const id of [
      "protected.static",
      "protected.fake",
      "getCrumb-geo-gb-20261016-getcrumb",
      "../escape",
    ]) {
      const storage = captureStore({
        fixtureRoot,
        mode: "recache",
        interval: 0,
      });
      const cache = createFetchCache({
        Store: storage.Store,
        fetch: async () => Response.json({ data: true }),
      });
      cache.once({ id, mode: "record" });
      await expect(
        cache("https://query2.finance.yahoo.com/v7/finance/quote", {}),
      ).rejects.toThrow();
      await expect(storage.drain()).rejects.toThrow();
    }
    const storage = captureStore({ fixtureRoot, mode: "recache", interval: 0 });
    const cache = createFetchCache({
      Store: storage.Store,
      fetch: async () => new Response("unavailable", { status: 503 }),
    });
    cache.once({ id: "transient", mode: "record" });
    await expect(
      cache("https://query2.finance.yahoo.com/v7/finance/quote", {}),
    ).rejects.toThrow("server-error");
    await expect(storage.drain()).rejects.toThrow();
    expect(await readdir(fixtureRoot)).toEqual([]);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
