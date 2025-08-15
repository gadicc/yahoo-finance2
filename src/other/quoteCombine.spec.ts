import { jest } from "@jest/globals";

import quoteCombine from "./quoteCombine.js";
import testYf from "../../tests/testYf.js";

const yf = testYf({ quoteCombine });

describe("quoteCombine", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("works with a single result", (done) => {
    const devel = "quoteCombine-AAPL.json";
    yf.quoteCombine("AAPL", undefined, { devel })
      .then((result: any) => {
        expect(result.symbol).toBe("AAPL");
        done();
      })
      .catch(done);
    jest.runAllTimers();
  });

  it("works with two results", (done) => {
    const opts = { devel: "quoteCombine-AAPL-TSLA.json" };
    Promise.all([
      yf.quoteCombine("AAPL", undefined, opts).then((result: any) => {
        expect(result.symbol).toBe("AAPL");
      }),

      yf.quoteCombine("TSLA", undefined, opts).then((result: any) => {
        expect(result.symbol).toBe("TSLA");
      }),
    ])
      .then(() => done())
      .catch(done);

    jest.runAllTimers();
  });

  it("resolves undefined for single missing symbol", (done) => {
    const devel = "quoteCombine-NONEXIST.json";
    yf.quoteCombine("NONEXIST", undefined, { devel })
      .then((result: any) => {
        expect(result).toBe(undefined);
        done();
      })
      .catch(done);
    jest.runAllTimers();
  });

  it("resolves undefined for missing symbols + resolves found", (done) => {
    const opts = { devel: "quoteCombine-AAPL-NONEXIST.json" };
    Promise.all([
      yf.quoteCombine("AAPL", undefined, opts).then((result: any) => {
        expect(result.symbol).toBe("AAPL");
      }),

      yf.quoteCombine("NONEXIST", undefined, opts).then((result: any) => {
        expect(result).toBe(undefined);
      }),
    ])
      .then(() => done())
      .catch(done);

    jest.runAllTimers();
  });

  it("throws if symbol arg is not a single string", () => {
    expect(() => yf.quoteCombine([])).toThrow(/string/);
  });

  if (process.env.FETCH_DEVEL !== "nocache") {
    it("throws on quote() error", () => {
      const opts = { devel: "weirdJsonResult.fake.json" };
      const promise = yf.quoteCombine("fake", undefined, opts);
      jest.runAllTimers();
      return expect(promise).rejects.toThrow(/Unexpected/);
    });
  }
});
