import { spy } from "../../tests/helpers/mock.ts";
import { afterEach, beforeEach } from "../../tests/helpers/runner.ts";
import { describe, expect, it } from "../../tests/common.ts";
import { _clearCache, getLatestVersion, versionCheck } from "./versions.ts";

describe("versions", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    _clearCache();
    globalThis.fetch = spy((input) => {
      expect(String(input)).toBe(
        "https://registry.npmjs.org/yahoo-finance2/latest",
      );
      return Promise.resolve(Response.json({ version: "2.13.3" }));
    });
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    _clearCache();
  });

  it("should return the current version", async () => {
    const version = await getLatestVersion();
    expect(version).toBe("2.13.3"); // cached
  });

  it("should return the current version and use cache for subsequent calls", async () => {
    const fetch = spy(globalThis.fetch);
    globalThis.fetch = fetch;

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
    const fetch = spy(globalThis.fetch);
    globalThis.fetch = fetch;

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
    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const response = await fixtureFetch(input, init);
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
