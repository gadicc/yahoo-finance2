import { afterAll } from "@std/testing/bdd";
import { FakeTime } from "@std/testing/time";
import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
} from "../../tests/common.ts";
import quoteCombine from "./quoteCombine.ts";

const YahooFinance = createTestYahooFinance({ modules: { quoteCombine } });
const yf = new YahooFinance();

describe("quoteCombine", () => {
  setupCache();

  const fakeTime = new FakeTime();
  afterAll(() => fakeTime.restore());

  // beforeEach(() => jest.useFakeTimers());
  // afterEach(() => jest.useRealTimers());

  it("works with a single result", (t, onFinish) => {
    const devel = { id: "quoteCombine-AAPL", t, onFinish };

    const promise = yf.quoteCombine("AAPL", undefined, { devel })
      .then((result) => {
        expect(result.symbol).toBe("AAPL");
      });

    fakeTime.runAll();
    return promise;
  });

  it("works with two results", (t, onFinish) => {
    const opts = { devel: { id: "quoteCombine-AAPL-TSLA", t, onFinish } };

    const promise = Promise.all([
      yf.quoteCombine("AAPL", undefined, opts).then((result) => {
        expect(result.symbol).toBe("AAPL");
      }),

      yf.quoteCombine("TSLA", undefined, opts).then((result) => {
        expect(result.symbol).toBe("TSLA");
      }),
    ]).then(() => {});

    fakeTime.runAll();
    return promise;
  });

  it("splits results by maxSymbolsPerRequest", async (t, onFinish) => {
    const yf = new YahooFinance({
      quoteCombine: { maxSymbolsPerRequest: 1 },
    });

    const promise = Promise.all([
      yf.quoteCombine("AAPL", undefined, {
        devel: { id: "quoteCombine-AAPL", t, onFinish },
      }).then((result) => {
        expect(result.symbol).toBe("AAPL");
      }),

      yf.quoteCombine("TSLA", undefined, {
        devel: { id: "quoteCombine-TSLA", t, onFinish },
      }).then((result) => {
        expect(result.symbol).toBe("TSLA");
      }),
    ]).then(() => {});

    fakeTime.runAll();
    await promise;
  });

  it("resolves undefined for single missing symbol", (t, onFinish) => {
    const devel = { id: "quoteCombine-NONEXIST", t, onFinish };
    const promise = yf.quoteCombine("NONEXIST", undefined, { devel })
      .then((result) => {
        expect(result).toBe(undefined);
      });
    fakeTime.runAll();
    return promise;
  });

  it(
    "resolves undefined for missing symbols + resolves found",
    (t, onFinish) => {
      const opts = { devel: { id: "quoteCombine-AAPL-NONEXIST", t, onFinish } };
      const promise = Promise.all([
        yf.quoteCombine("AAPL", undefined, opts).then((result) => {
          expect(result.symbol).toBe("AAPL");
        }),

        yf.quoteCombine("NONEXIST", undefined, opts).then((result) => {
          expect(result).toBe(undefined);
        }),
      ]).then(() => {});

      fakeTime.runAll();
      return promise;
    },
  );

  it("throws if symbol arg is not a single string", () => {
    // @ts-expect-error: testing invalid runtime value
    expect(() => yf.quoteCombine([])).toThrow(/string/);
  });

  it(
    "handles unmatched/normalized symbol from Yahoo without throwing and resolves undefined",
    (t, onFinish) => {
      const opts = {
        devel: { id: "quoteCombine-normalized-symbol.fake", t, onFinish },
      };
      const promise = yf.quoteCombine("aapl", undefined, opts)
        .then((result) => {
          expect(result).toBe(undefined);
        });

      fakeTime.runAll();
      return promise;
    },
  );

  it(
    "scopes quoteCombine debounce map to the instance",
    async (t, onFinish) => {
      const yf1 = new YahooFinance();
      const yf2 = new YahooFinance();

      const opts1 = { devel: { id: "quoteCombine-AAPL", t, onFinish } };
      const opts2 = { devel: { id: "quoteCombine-TSLA", t, onFinish } };

      const p1 = yf1.quoteCombine("AAPL", undefined, opts1).then((res) => {
        expect(res.symbol).toBe("AAPL");
      });
      const p2 = yf2.quoteCombine("TSLA", undefined, opts2).then((res) => {
        expect(res.symbol).toBe("TSLA");
      });

      fakeTime.runAll();
      await Promise.all([p1, p2]);
    },
  );

  it("throws on quote() error", (t, onFinish) => {
    const opts = { devel: { id: "weirdJsonResult.fake", t, onFinish } };
    const promise = yf.quoteCombine("fake", undefined, opts);
    fakeTime.runAll();
    return expect(promise).rejects.toThrow(/Unexpected/);
  });
});
