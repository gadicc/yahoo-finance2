import {
  createTestYahooFinance,
  describe,
  expect,
  it,
} from "../../tests/common.ts";

import { spy } from "../../tests/helpers/mock.ts";

describe("notices", () => {
  const createTestYahooFinanceOptions = {
    modules: {},
    // By default, createTestYahooFinance suppresses yahooSurvey
    _opts: { suppressNotices: [] },
  };

  function createLogger() {
    return {
      info: spy(),
      warn: spy(),
      error: spy(),
      debug: spy(),
      dir: spy(),
    };
  }

  it("shows notices", () => {
    const logger = createLogger();
    const YahooFinance = createTestYahooFinance(createTestYahooFinanceOptions);
    const yf = new YahooFinance({ logger });

    yf._notices.show("yahooSurvey");
    expect(logger.info.calls.length).toBe(1);
  });

  it("shows notices with `onceOnly` (e.g. YahooSurvey) once only", () => {
    const logger = createLogger();
    const YahooFinance = createTestYahooFinance(createTestYahooFinanceOptions);
    const yf = new YahooFinance({ logger });

    yf._notices.show("yahooSurvey");
    expect(logger.info.calls.length).toBe(1);
    expect(yf._notices._suppressed.has("yahooSurvey")).toBe(true);

    yf._notices.show("yahooSurvey");
    expect(logger.info.calls.length).toBe(1);
  });

  it("shows notices with `level: 'warn' (e.g. ripHistorical) as warnings", () => {
    const logger = createLogger();
    const YahooFinance = createTestYahooFinance(createTestYahooFinanceOptions);
    const yf = new YahooFinance({ logger });

    yf._notices.show("ripHistorical");
    expect(logger.warn.calls.length).toBe(1);
  });

  it("suppresses notices via suppress()", () => {
    const logger = createLogger();
    const YahooFinance = createTestYahooFinance(createTestYahooFinanceOptions);
    const yf = new YahooFinance({ logger });

    yf._notices.suppress(["yahooSurvey"]);
    expect(yf._notices._suppressed.has("yahooSurvey")).toBe(true);

    yf._notices.show("yahooSurvey");
    expect(logger.info.calls.length).toBe(0);
  });

  it("suppresses notices with new YahooFinance({ supresssNotices: [...] })", () => {
    const logger = createLogger();
    const YahooFinance = createTestYahooFinance({ modules: {} });
    const yf = new YahooFinance({
      logger,
      suppressNotices: ["yahooSurvey"],
    });

    yf._notices.show("yahooSurvey");
    expect(logger.info.calls.length).toBe(0);
  });

  it("suppresses notices via createYahooFinance({ _opts: { supresssNotices: [...] } })", () => {
    const logger = createLogger();
    const YahooFinance = createTestYahooFinance({
      modules: {},
      _opts: { suppressNotices: ["yahooSurvey"] },
    });
    const yf = new YahooFinance({ logger });

    yf._notices.show("yahooSurvey");
    expect(logger.info.calls.length).toBe(0);
  });
});
