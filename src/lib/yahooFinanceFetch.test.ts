// import * as util from "node:util";
import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
} from "../../tests/common.ts";
import { spy } from "@std/testing/mock";
import { afterEach, beforeEach } from "@std/testing/bdd";
import { FakeTime } from "@std/testing/time";

import Queue from "./queue.ts";
import _yahooFinanceFetch, {
  substituteVariables,
} from "./yahooFinanceFetch.ts";
import errors from "./errors.ts";
import quote from "../modules/quote.ts";

// Useful to set to false if during development
const HIDE_CONSOLE_LOGS = true;

const YahooFinance = createTestYahooFinance({ modules: { quote } });

// https://dev.to/devcrafter91/elegant-way-to-check-if-a-promise-is-pending-577g
/*
function isPending(promise: any) {
  return util.inspect(promise).includes("pending");
}
*/

describe("yahooFinanceFetch", () => {
  setupCache();

  if (HIDE_CONSOLE_LOGS) {
    // Don't log errors during tests
    const fakeConsole = { log: spy(), error: spy(), dir: spy() };
    const origConsole = globalThis.console;

    // @ts-expect-error: test stubs
    beforeEach(() => (globalThis.console = fakeConsole));
    // @ts-expect-error: actually i don't know why this is an error `:)
    afterEach(() => (globalThis.console = origConsole));
  }

  it("catches errors", (t, onFinish) => {
    const yahooFinance = new YahooFinance();
    const url = "https://query2.finance.yahoo.com/v1/finance/search";

    return expect(
      yahooFinance._fetch(url, {}, {
        devel: { id: "search-noOpts", t, onFinish },
      }),
    ).rejects.toBeInstanceOf(errors.BadRequestError);
  });

  it("throws if no environmennt set", () => {
    const yahooFinance = new YahooFinance();
    // @ts-expect-error: for testing purposes
    yahooFinance._env = null;
    return expect(yahooFinance._fetch("")).rejects.toBeInstanceOf(
      errors.NoEnvironmentError,
    );
  });

  it(
    "throws HTTPError if !res.ok and no error in json result",
    (t, onFinish) => {
      const yahooFinance = new YahooFinance();
      return expect(
        yahooFinance._fetch(
          "https://query2.finance.yahoo.com/nonExistingURL-CACHED",
          {},
          { devel: { id: "pageWith404andJson.fake", t, onFinish } },
        ),
      ).rejects.toBeInstanceOf(errors.HTTPError);
    },
  );

  it(
    "throws Error if we receive unknown error from json result",
    (t, onFinish) => {
      const yahooFinance = new YahooFinance();
      return expect(
        yahooFinance._fetch(
          "https://query2.finance.yahoo.com/nonExistingURL-CACHED",
          {},
          { devel: { id: "pageWithUnknownError", t, onFinish } },
        ),
      ).rejects.toBeInstanceOf(Error);
    },
  );

  describe("concurrency", () => {
    /*
    process.on("unhandledRejection", (up) => {
      console.error("Unhandled promise rejection!");
      throw up;
    });
    */

    function immediate() {
      return new Promise((resolve) => {
        // setImmediate(resolve);
        setTimeout(resolve, 0);
      });
    }

    function makeFetch() {
      function fetch() {
        return new Promise((resolve, reject) => {
          fetch.fetches.push({
            resolve,
            reject,
            resolveWith(obj: unknown) {
              resolve({
                ok: true,
                headers: new Headers(),
                text() {
                  return Promise.resolve(JSON.stringify(obj));
                },
                json() {
                  return Promise.resolve(obj);
                },
              });
              return immediate();
            },
          });
        });
      }
      fetch.fetches = [] as Array<{
        resolve: (value: unknown) => void;
        reject: (reason?: unknown) => void;
        resolveWith(obj: unknown): void;
      }>;
      fetch.reset = function reset() {
        // TODO check that all are resolved/rejected
        fetch.fetches = [];
      };
      return fetch;
    }

    it("Queue takes options in constructor", () => {
      const queue = new Queue({ concurrency: 5 });
      expect(queue.concurrency).toBe(5);
    });

    it("Queue spaces request starts by interval", async () => {
      const fakeTime = new FakeTime();
      try {
        const queue = new Queue({ concurrency: 2, interval: 100 });
        const starts: number[] = [];
        let resolveFirst: (value: unknown) => void;

        const first = queue.add(() => {
          starts.push(Date.now());
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        });
        const second = queue.add(() => {
          starts.push(Date.now());
          return Promise.resolve("second");
        });

        await Promise.resolve();
        expect(starts).toHaveLength(1);

        fakeTime.tick(99);
        await Promise.resolve();
        expect(starts).toHaveLength(1);

        fakeTime.tick(1);
        await Promise.resolve();
        expect(starts).toHaveLength(2);
        expect(starts[1] - starts[0]).toBe(100);

        resolveFirst!("first");
        await expect(Promise.all([first, second])).resolves.toEqual([
          "first",
          "second",
        ]);
      } finally {
        fakeTime.restore();
      }
    });

    it("yahooFinanceFetch branch check for alternate queue", async () => {
      const fetch = makeFetch();
      const yahooFinance = new YahooFinance({
        fetch: fetch as typeof globalThis.fetch,
      });
      const url = "http://example.com";
      const promises = [
        yahooFinance._fetch(url, {}),
        yahooFinance._fetch(url, {}, {}),
        yahooFinance._fetch(url, {}, { queue: {} }),
      ];

      await immediate();

      fetch.fetches[0].resolveWith({ ok: true });
      fetch.fetches[1].resolveWith({ ok: true });
      fetch.fetches[2].resolveWith({ ok: true });

      await Promise.all(promises);
    });

    it("assert defualts to {} for empty queue opts", async () => {
      const fetch = makeFetch();
      const yahooFinance = new YahooFinance({
        fetch: fetch as typeof globalThis.fetch,
      });

      const url = "http://example.com";
      const moduleOpts = { queue: { _queue: new Queue(), concurrency: 1 } };
      const yahooFinanceFetch = _yahooFinanceFetch.bind(yahooFinance);

      moduleOpts.queue._queue.concurrency = 1;
      const promise = yahooFinanceFetch(url, {}, moduleOpts);
      await immediate();
      fetch!.fetches[0].resolveWith({ ok: true });
      await expect(promise).resolves.toMatchObject({ ok: true });
    });

    it("single item in queue", async () => {
      const fetch = makeFetch();
      const yahooFinance = new YahooFinance({
        fetch: fetch as typeof globalThis.fetch,
      });

      const url = "http://example.com";
      const moduleOpts = { queue: { _queue: new Queue(), concurrency: 1 } };
      moduleOpts.queue._queue.concurrency = 1;

      const promise = yahooFinance._fetch(url, {}, moduleOpts);
      await immediate();
      fetch!.fetches[0].resolveWith({ ok: true });
      await expect(promise).resolves.toMatchObject({ ok: true });
    });

    /* TODO
    it("waits if exceeding concurrency max", async () => {
      const fetch = makeFetch();
      const yahooFinance = new YahooFinance({
        fetch: fetch as typeof globalThis.fetch,
      });

      const url = "http://example.com";
      const moduleOpts = { queue: { _queue: new Queue(), concurrency: 1 } };
      moduleOpts.queue._queue.concurrency = 1;

      const promises = [
        yahooFinance._fetch(url, {}, moduleOpts),
        yahooFinance._fetch(url, {}, moduleOpts),
      ];
      await immediate();

      // Second func should not be called until 1st reoslves (limit 1)
      expect(fetch.fetches.length).toBe(1);

      await fetch.fetches[0].resolveWith({ ok: true });
      expect(fetch.fetches.length).toBe(2);

      await fetch.fetches[1].resolveWith({ ok: true });
      await Promise.all(promises);
    });
    */

    // TODO, timeout test
  });

  describe("URL variable substitution", () => {
    it("subs YF_QUERY_HOST from _opts", () => {
      const yahooFinance = new YahooFinance();
      expect(yahooFinance._opts.YF_QUERY_HOST).toBe("query2.finance.yahoo.com");
      const origUrl = "https://${YF_QUERY_HOST}/v8/something";
      // @ts-ignore: partial This for testing
      const newUrl = substituteVariables.call(yahooFinance, origUrl);
      expect(newUrl).toBe("https://query2.finance.yahoo.com/v8/something");
    });

    it("subs query2 if no option", () => {
      const yahooFinance = new YahooFinance({});
      delete yahooFinance._opts.YF_QUERY_HOST;
      const origUrl = "https://${YF_QUERY_HOST}/v8/something";
      // @ts-ignore: partial This for testing
      const newUrl = substituteVariables.call(yahooFinance, origUrl);
      expect(newUrl).toBe("https://query2.finance.yahoo.com/v8/something");
    });

    it("leaves non-matches", () => {
      const yahooFinance = new YahooFinance();
      const origUrl = "${something}";
      // @ts-ignore: partial This for testing
      const newUrl = substituteVariables.call(yahooFinance, origUrl);
      expect(newUrl).toBe("${something}");
    });
  });
});
