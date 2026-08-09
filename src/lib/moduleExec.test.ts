import {
  createTestYahooFinance,
  describe,
  expect,
  it,
  setupCache,
} from "../../tests/common.ts";
import { spy } from "@std/testing/mock";

import search from "../modules/search.ts";
import chart from "../modules/chart.ts";
import { InvalidOptionsError } from "./errors.ts";

const YahooFinance = createTestYahooFinance({ modules: { search, chart } });
const yf = new YahooFinance({ validation: { logErrors: false } });

function createNewLogger() {
  return {
    info: spy(),
    warn: spy(),
    error: spy(),
    debug: spy(),
    dir: spy(),
  };
}

describe("moduleExec", () => {
  setupCache();

  describe("assertSymbol", () => {
    const periodOpts = {
      period1: new Date("2022-02-22"),
      period2: new Date("2022-02-23"),
    };

    it("accepts a string", async (t, onFinish) => {
      const devel = { id: "chart-AAPL", t, onFinish };
      await expect(
        yf.chart("AAPL", periodOpts, { devel }),
      ).resolves.toBeDefined();
    });

    it("throws otherwise", async () => {
      // deno-lint-ignore no-explicit-any
      const yfc = (symbol: any) => yf.chart(symbol, periodOpts);
      await expect(yfc(["AAPL"])).rejects.toThrow(/string symbol/);
    });
  });

  describe("options validation", () => {
    it("throws InvalidOptions on invalid options", async () => {
      // deno-lint-ignore no-explicit-any
      const rwo = (options: any) => yf.search("symbol", options);
      await expect(rwo({ invalid: true })).rejects.toThrow(InvalidOptionsError);
    });

    it(
      "does not throw InvalidOptions on invalid options with validateOptions = false",
      async (t, onFinish) => {
        // deno-lint-ignore no-explicit-any
        const rwo = (options: any) =>
          yf.search("symbol", options, {
            validateOptions: false,
            devel: { id: "search-invalid-opts", t, onFinish },
          });
        await expect(rwo({ invalid: true })).resolves.toBeDefined();
      },
    );

    it("accepts empty queryOptions", async (t, onFinish) => {
      const devel = { id: "search-AAPL", t, onFinish };
      await expect(
        yf.search("AAPL", undefined, { devel }),
      ).resolves.toBeDefined();
    });

    it("logs errors on invalid options when logOptionsErrors = true", async () => {
      const logger = createNewLogger();
      const yf = new YahooFinance({
        logger,
        validation: { logOptionsErrors: true },
      });
      // deno-lint-ignore no-explicit-any
      const rwo = (options: any) => yf.search("symbol", options);
      await expect(rwo({ invalid: true })).rejects.toThrow(InvalidOptionsError);
      expect(
        logger.info.calls.length +
          logger.error.calls.length +
          logger.dir.calls.length,
      ).toBeGreaterThan(1);
    });

    it("does not log errors on invalid options when logOptionsErrors = false", async () => {
      const logger = createNewLogger();
      const yf = new YahooFinance({
        logger,
        validation: { logOptionsErrors: false },
      });
      // deno-lint-ignore no-explicit-any
      const rwo = (options: any) => yf.search("symbol", options);
      await expect(rwo({ invalid: true })).rejects.toThrow(InvalidOptionsError);
      expect(
        logger.info.calls.length +
          logger.error.calls.length +
          logger.dir.calls.length,
      ).toBe(0);
    });
  });

  describe("result validation", () => {
    it("throws on unexpected input", async (t, onFinish) => {
      const devel = { id: "search-badResult.fake", t, onFinish };
      await expect(
        yf.search("AAPL", {}, { devel }),
      ).rejects.toThrow(/Failed Yahoo Schema/);
    });

    it(
      "throws on unexpected input with {validateResult: true}",
      async (t, onFinish) => {
        const devel = { id: "search-badResult.fake", t, onFinish };
        await expect(
          yf.search("AAPL", {}, { devel, validateResult: true }),
        ).rejects.toThrow(/Failed Yahoo Schema/);
      },
    );

    it(
      "dont throw or log on unexpected input with {validateResult: false}",
      async (t, onFinish) => {
        const logger = createNewLogger();
        const yf = new YahooFinance({
          logger,
          validation: { logErrors: false },
        });
        await expect(
          yf.search(
            "AAPL",
            {},
            {
              devel: { id: "search-badResult.fake", t, onFinish },
              validateResult: false,
            },
          ),
        ).resolves.toBeDefined();

        // expect(logger.info).not.toHaveBeenCalled();
        // expect(logger.error).not.toHaveBeenCalled();
        // expect(logger.dir).not.toHaveBeenCalled();
        expect(
          logger.info.calls.length + logger.error.calls.length +
            logger.dir.calls.length,
        ).toBe(0);
      },
    );
  });
});
