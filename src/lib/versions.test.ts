import { spy } from "@std/testing/mock";
import { beforeEach } from "@std/testing/bdd";
import { describe, expect, it, setupCache } from "../../tests/common.ts";
import { _clearCache, getLatestVersion, versionCheck } from "./versions.ts";

describe.skip("versions", () => {
  const origFetch = globalThis.fetch;
  setupCache();

  beforeEach(() => {
    _clearCache();
  });

  it("should return the current version", async () => {
    const version = await getLatestVersion();
    expect(version).toBe("2.13.3"); // cached
  });

  it("should return the current version and use cache for subsequent calls", async () => {
    const fetch = globalThis.fetch = spy(globalThis.fetch);

    expect(await getLatestVersion()).toBe("2.13.3"); // fresh
    expect(fetch.calls.length).toBe(1);
    expect(await getLatestVersion()).toBe("2.13.3"); // cached
    expect(fetch.calls.length).toBe(1);
  });

  it("should return unmatched versions", async () => {
    const versions = await versionCheck();
    expect(versions).toMatchObject({
      current: "0.0.1",
      latest: "2.13.3",
      isLatest: false,
    });
  });

  it("should return unmatched versions and use cache for subsequent calls", async () => {
    const fetch = globalThis.fetch = spy(globalThis.fetch);

    expect(await versionCheck()).toMatchObject({
      current: "0.0.1",
      latest: "2.13.3",
      isLatest: false,
    });
    expect(fetch.calls.length).toBe(1); // fresh

    expect(await versionCheck()).toMatchObject({
      current: "0.0.1",
      latest: "2.13.3",
      isLatest: false,
    });
    expect(fetch.calls.length).toBe(1); // cached, still 1.
  });

  it("should return matched versions", async () => {
    globalThis.fetch = async (input, init) => {
      const response = await origFetch(input, init);
      if (response.ok) {
        const data = await response.json();
        if (data.version) {
          data.version = "0.0.1";
        }
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return response;
    };

    const versions = await versionCheck();
    expect(versions).toMatchObject({
      current: "0.0.1",
      latest: "0.0.1",
      isLatest: true,
    });
  });
});
