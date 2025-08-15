import * as util from "util";
import { jest } from "@jest/globals";

import Queue from "./queue.js";
import _yahooFinanceFetch, {
  substituteVariables,
} from "./yahooFinanceFetch.js";
import errors from "./errors.js";

import _env from "../env-test.js";
import _opts from "./options.js";

// https://dev.to/devcrafter91/elegant-way-to-check-if-a-promise-is-pending-577g
function isPending(promise: any) {
  return util.inspect(promise).includes("pending");
}

describe("yahooFinanceFetch", () => {
  // @ts-ignore: partial This for testing
  const yahooFinanceFetch = _yahooFinanceFetch.bind({ _env, _opts });

  // Don't log errors during tests
  const fakeConsole = { log: jest.fn(), error: jest.fn(), dir: jest.fn() };
  const origConsole = console;

  // @ts-ignore
  beforeEach(() => (console = fakeConsole));
  afterEach(() => (console = origConsole));

  it("catches errors", () => {
    const url = "https://query2.finance.yahoo.com/v1/finance/search";

    return expect(
      yahooFinanceFetch(url, {}, { devel: "search-noOpts.json" }),
    ).rejects.toBeInstanceOf(errors.BadRequestError);
  });

  it("throws if no environmennt set", () => {
    // @ts-ignore: we're explicityly testing for a bad runtime context
    return expect(_yahooFinanceFetch("")).rejects.toBeInstanceOf(
      errors.NoEnvironmentError,
    );
  });

  if (process.env.FETCH_DEVEL !== "nocache") {
    it("throws HTTPError if !res.ok and no error in json result", () => {
      return expect(
        yahooFinanceFetch(
          "https://query2.finance.yahoo.com/nonExistingURL-CACHED",
          {},
          { devel: "pageWith404andJson.fake.json" },
        ),
      ).rejects.toBeInstanceOf(errors.HTTPError);
    });
  }

  it("throws Error if we receive unknown error from json result", () => {
    return expect(
      yahooFinanceFetch(
        "https://query2.finance.yahoo.com/nonExistingURL-CACHED",
        {},
        { devel: "pageWithUnknownError.json" },
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  describe("concurrency", () => {
    /*
    process.on("unhandledRejection", (up) => {
      console.error("Unhandled promise rejection!");
      throw up;
    });
    */

    function immediate() {
      return new Promise((resolve) => {
        setImmediate(resolve);
      });
    }

    function makeFetch() {
      function fetch() {
        return new Promise((resolve, reject) => {
          fetch.fetches.push({
            resolve,
            reject,
            resolveWith(obj: any) {
              resolve({
                ok: true,
                headers: new Headers(),
                async json() {
                  return obj;
                },
              });
              return immediate();
            },
          });
        });
      }
      fetch.fetches = [] as any[];
      fetch.reset = function reset() {
        // TODO check that all are resolved/rejected
        fetch.fetches = [];
      };
      return fetch;
    }

    let env: any;
    let yahooFinanceFetch: any;
    let moduleOpts: any;

    beforeEach(() => {
      env = { ..._env, fetch: makeFetch() };
      yahooFinanceFetch = _yahooFinanceFetch.bind({ _env: env, _opts });
      moduleOpts = { queue: { _queue: new Queue() } };
    });

    it("Queue takes options in constructor", () => {
      const queue = new Queue({ concurrency: 5 });
      expect(queue.concurrency).toBe(5);
    });

    it("yahooFinanceFetch branch check for alternate queue", async () => {
      const url = "http://example.com";
      const promises = [
        yahooFinanceFetch(url, {}),
        yahooFinanceFetch(url, {}, {}),
        yahooFinanceFetch(url, {}, { queue: {} }),
      ];

      await immediate();

      env.fetch.fetches[0].resolveWith({ ok: true });
      env.fetch.fetches[1].resolveWith({ ok: true });
      env.fetch.fetches[2].resolveWith({ ok: true });

      await Promise.all(promises);
    });

    it("assert defualts to {} for empty queue opts", async () => {
      const url = "http://example.com";
      moduleOpts.queue.concurrency = 1;
      const opts = { ..._opts };
      // @ts-ignore: intentional to test runtime failures
      delete opts.queue;
      const yahooFinanceFetch = _yahooFinanceFetch.bind({ _env: env, _opts });

      const promise = yahooFinanceFetch(url, {}, moduleOpts);
      await immediate();
      env.fetch.fetches[0].resolveWith({ ok: true });
      await expect(promise).resolves.toMatchObject({ ok: true });
    });

    it("single item in queue", async () => {
      const url = "http://example.com";
      moduleOpts.queue.concurrency = 1;

      const promise = yahooFinanceFetch(url, {}, moduleOpts);
      await immediate();
      env.fetch.fetches[0].resolveWith({ ok: true });
      await expect(promise).resolves.toMatchObject({ ok: true });
    });

    it("waits if exceeding concurrency max", async () => {
      const url = "http://example.com";
      moduleOpts.queue.concurrency = 1;

      const promises = [
        yahooFinanceFetch(url, {}, moduleOpts),
        yahooFinanceFetch(url, {}, moduleOpts),
      ];
      await immediate();

      // Second func should not be called until 1st reoslves (limit 1)
      expect(env.fetch.fetches.length).toBe(1);

      await env.fetch.fetches[0].resolveWith({ ok: true });
      expect(env.fetch.fetches.length).toBe(2);

      await env.fetch.fetches[1].resolveWith({ ok: true });
      await Promise.all(promises);
    });

    // TODO, timeout test
  });

  describe("URL variable substitution", () => {
    const that = { _opts };

    it("subs YF_QUERY_HOST from _opts", () => {
      const origUrl = "https://${YF_QUERY_HOST}/v8/something";
      // @ts-ignore: partial This for testing
      const newUrl = substituteVariables.call(that, origUrl);
      expect(newUrl).toBe("https://query2.finance.yahoo.com/v8/something");
    });

    it("subs query2 if no option", () => {
      const that = { _env, _opts: { ..._opts } };
      delete that._opts.YF_QUERY_HOST;
      const origUrl = "https://${YF_QUERY_HOST}/v8/something";
      // @ts-ignore: partial This for testing
      const newUrl = substituteVariables.call(that, origUrl);
      expect(newUrl).toBe("https://query2.finance.yahoo.com/v8/something");
    });

    it("leaves non-matches", () => {
      const origUrl = "${something}";
      // @ts-ignore: partial This for testing
      const newUrl = substituteVariables.call(that, origUrl);
      expect(newUrl).toBe("${something}");
    });
  });
});
