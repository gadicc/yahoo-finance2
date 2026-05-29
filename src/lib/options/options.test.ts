import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  spyLogger,
} from "../../../tests/common.ts";
import {
  mergeObjects,
  validateOptions as _validateOptions,
} from "./options.ts";

const YahooFinance = createTestYahooFinance({ modules: {} });

describe("lib/options", () => {
  describe("mergeObjects", () => {
    it("should merge two objects", () => {
      const existing = { a: 1, b: 2 };
      const overrides = { b: 3, c: 4 };
      mergeObjects(existing, overrides);
      expect(existing).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("should merge nested objects", () => {
      const existing = { queue: { concurrency: 5, timeout: 60 } };
      const overrides = { queue: { timeout: 30 } };
      mergeObjects(existing, overrides);
      expect(existing).toEqual({ queue: { concurrency: 5, timeout: 30 } });
    });
  });

  describe("validateOptions", () => {
    it("should validate JSON types", () => {
      const logger = spyLogger();
      const yahooFinance = new YahooFinance({ logger });
      const validateOptions = _validateOptions.bind(yahooFinance);

      expect(() => validateOptions({ YF_QUERY_HOST: "moo" })).not.toThrow();
      // @ts-expect-error: yup, exactly what we're testing for
      expect(() => validateOptions({ YF_QUERY_HOST: 123 })).toThrow();
      expect(() => validateOptions({ queue: { interval: 250 } })).not
        .toThrow();
      // @ts-expect-error: yup, exactly what we're testing for
      expect(() => validateOptions({ queue: { interval: "fast" } })).toThrow();
    });
  });
});
