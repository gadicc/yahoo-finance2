import createYahooFinance from "./createYahooFinance.ts";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { spy } from "@std/testing/mock";
import trendingSymbols from "./modules/trendingSymbols.ts";
import defaultOptions from "./lib/options/defaults.ts";

describe("createYahooFinance", () => {
  it("inits", () => {
    const YahooFinance = createYahooFinance({ modules: {} });
    new YahooFinance();
  });

  // See also `lib/options/options.test.ts`.  This tests mostly overrides
  // from createOpts and instantiation.
  describe("options", () => {
    it("uses defaults", () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance();
      expect(yf._opts.YF_QUERY_HOST).toBe(defaultOptions.YF_QUERY_HOST);
    });

    it("can be overriden from createOpts", () => {
      const YahooFinance = createYahooFinance({
        modules: {},
        _opts: { YF_QUERY_HOST: "moo" },
      });
      const yf = new YahooFinance();
      expect(yf._opts.YF_QUERY_HOST).toBe("moo");
    });

    it("can override on instance", () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance({ YF_QUERY_HOST: "moo" });
      expect(yf._opts.YF_QUERY_HOST).toBe("moo");
    });

    it("can be overridden with _setOpts", () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance();
      yf._setOpts({ YF_QUERY_HOST: "moo" });
      expect(yf._opts.YF_QUERY_HOST).toBe("moo");
    });
  });

  describe("fetch environment", () => {
    it("is null by default", () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance();
      expect(yf._env.fetch).toBeNull();
    });

    it("can be overrided with _env", () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance();
      // @ts-expect-error: yes this isn't final
      yf._env.fetch = () => new Response("test");
      expect(yf._env.fetch).toBeDefined();
    });

    it("can be set at instance time", () => {
      const fetch =
        (() => new Response("test")) as unknown as typeof globalThis.fetch;
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance({ fetch });
      // @ts-expect-error: yes this isn't final
      yf._env.fetch = () => new Response("test");
      expect(yf._env.fetch).toBeDefined();
    });

    it("if not overriden it will use globalThis.fetch", async () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance();
      expect(yf._env.fetch).toBeNull();
      expect(yf._opts.fetch).toBeUndefined();

      const globalFetch = globalThis.fetch;
      const mockFetch = spy(() => Promise.resolve(new Response("{}")));
      globalThis.fetch = mockFetch;

      await yf._fetch("http://this.wont.be.used");

      // assertSpyCall(mockFetch, 1);  doesn't work???
      expect(mockFetch.calls.length).toBe(1);

      globalThis.fetch = globalFetch;
    });

    it("accepts override at instance time", async () => {
      const mockFetch = spy(() => Promise.resolve(new Response("{}")));

      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance({ fetch: mockFetch });
      expect(yf._env.fetch).toBeNull();
      expect(yf._opts.fetch).toBe(mockFetch);

      await yf._fetch("http://this.wont.be.used");
      expect(mockFetch.calls.length).toBe(1);
    });

    it("will use _env override if set", async () => {
      const YahooFinance = createYahooFinance({ modules: {} });
      const yf = new YahooFinance({});
      expect(yf._env.fetch).toBeNull();

      const mockFetch = spy(() => Promise.resolve(new Response("{}")));
      yf._opts.fetch = mockFetch;

      await yf._fetch("http://this.wont.be.used");
      expect(mockFetch.calls.length).toBe(1);
    });

    it("will accept a per module fetch override", async () => {
      const validResult = {
        "finance": {
          "result": [
            {
              "count": 1,
              "quotes": [
                {
                  "symbol": "^AORD",
                },
              ],
              "jobTimestamp": 0,
              "startInterval": 0,
            },
          ],
          "error": null,
        },
      };

      const mockFetch = spy(() =>
        Promise.resolve(new Response(JSON.stringify(validResult)))
      );

      const YahooFinance = createYahooFinance({ modules: { trendingSymbols } });
      const yf = new YahooFinance({});

      await yf.trendingSymbols("US", {}, { fetch: mockFetch });
      expect(mockFetch.calls.length).toBe(1);
    });
  });
});
