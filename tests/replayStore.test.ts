import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import createFetchCache from "fetch-mock-cache/runtimes/bun.ts";
import { runtime } from "fetch-mock-cache/runtimes/node.ts";
import type { FMCCacheContent } from "fetch-mock-cache/store";
import ReplayStore from "./replayStore.ts";
import { test } from "./helpers/runner.ts";
import { expect } from "./helpers/assertions.ts";

const content: FMCCacheContent = {
  request: { url: "https://example.invalid/cached", method: "GET" },
  response: {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {},
    bodyText: "cached",
  },
};

test("replay store reads fixtures without creating missing directories or permitting writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "yf-readonly-store-"));
  try {
    const location = join(root, "missing", "fixtures");
    const store = new ReplayStore({ runtime, location });
    expect(await store.fetchContent(content.request, { id: "absent" })).toBe(
      null,
    );
    expect(existsSync(join(root, "missing"))).toBe(false);
    for (const options of [
      {},
      { mode: "record" as const, writeCache: true },
      { writeCache: Promise.resolve(true) },
    ]) {
      await expect(store.storeContent(content, options)).rejects.toThrow(
        "read-only",
      );
    }
    expect(existsSync(join(root, "missing"))).toBe(false);
    mkdirSync(location, { recursive: true });
    const fixture = join(location, "cached.json");
    writeFileSync(fixture, JSON.stringify(content));
    const before = readFileSync(fixture, "utf8");
    expect(await store.fetchContent(content.request, { id: "cached" })).toEqual(
      content,
    );
    await expect(
      store.storeContent(content, { id: "cached", mode: "record" }),
    ).rejects.toThrow("read-only");
    expect(readFileSync(fixture, "utf8")).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replay store rejects path and Windows filename aliases before reading", async () => {
  const store = new ReplayStore({ runtime });
  for (const id of [
    "../escape",
    "a/b",
    "a\\b",
    "C:stream",
    "a?b",
    "CON",
    "lpt1",
    "a\nname",
  ]) {
    await expect(store.idFromRequest(content.request, { id })).rejects.toThrow(
      "plain filename",
    );
  }
  await expect(store.cache_dir("../escape.json")).rejects.toThrow(
    "plain filename",
  );
  expect(
    await store.idFromRequest(content.request, {
      id: "getCrumb-geo-gb-20260101.static",
    }),
  ).toBe("getCrumb-geo-gb-20260101.static.json");
});

test("replay rejects complete DOS aliases before resolving filesystem paths", async () => {
  const store = new ReplayStore({ runtime });
  let rootAccesses = 0;
  // cache_dir must reject aliases before even resolving the root for lstat/read.
  Object.defineProperty(store, "_location", {
    get() {
      rootAccesses++;
      throw new Error("filesystem root accessed");
    },
  });
  const devices = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"];
  for (const prefix of ["COM", "LPT"]) {
    for (const digit of "123456789¹²³") devices.push(prefix + digit);
  }
  for (const device of devices) {
    const mixed = device[0] + device.slice(1).toLowerCase();
    for (const id of [
      device,
      mixed,
      `${mixed}.txt`,
      `${mixed} .txt`,
      `${mixed}  `,
    ]) {
      await expect(
        store.idFromRequest(content.request, { id }),
      ).rejects.toThrow("plain filename");
      await expect(store.cache_dir(`${id}.json`)).rejects.toThrow(
        "plain filename",
      );
    }
  }
  expect(rootAccesses).toBe(0);
  // A valid filename reaches the sentinel, proving the rejection check is active.
  await expect(store.cache_dir("ordinary.json")).rejects.toThrow(
    "filesystem root accessed",
  );
  expect(rootAccesses).toBe(1);

  const root = mkdtempSync(join(tmpdir(), "yf-portable-ids-"));
  try {
    const location = join(root, "missing");
    const readable = new ReplayStore({ runtime, location });
    for (const id of [
      "COM0",
      "COM10",
      "COM⁴",
      "COM¹suffix",
      "prefixCOM¹",
      "LPT0",
      "LPT10",
      "LPT⁴",
      "LPT³suffix",
      "CONIN",
      "CONOUT",
      "CONIN$extra",
      "NUL extra",
      "getCrumb-geo-gb-20260101.static",
    ]) {
      expect(await readable.idFromRequest(content.request, { id })).toBe(
        `${id}.json`,
      );
      expect(await readable.cache_dir(`${id}.json`)).toBe(
        join(location, `${id}.json`),
      );
    }
    expect(existsSync(location)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replay misses and per-call live/write overrides retain an offline fallback", async () => {
  const root = mkdtempSync(join(tmpdir(), "yf-offline-overrides-"));
  try {
    let live = 0;
    const cache = createFetchCache({
      Store: [ReplayStore, { location: join(root, "absent") }],
      mode: "replay",
      fetch: () => {
        live++;
        throw new Error("offline fallback");
      },
    });
    cache.once({ id: "missing" });
    await expect(cache(content.request.url, undefined)).rejects.toThrow(
      "cache miss in replay",
    );
    expect(live).toBe(0);
    for (const mode of ["record", "auto", "off"] as const) {
      cache.once({ id: "missing", mode, readCache: false, writeCache: true });
      await expect(cache(content.request.url, undefined)).rejects.toThrow(
        "offline fallback",
      );
    }
    expect(live).toBe(3); // Calls reach only the supplied rejecting fallback.
    expect(existsSync(join(root, "absent"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
