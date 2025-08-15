import { consoleRestore, consoleSilent } from "../../tests/console.js";
import testYf from "../../tests/testYf.js";
import options from "./options.js";
import setGlobalConfig from "./setGlobalConfig.js";
const yf = testYf({ setGlobalConfig });

describe("setGlobalConfig", () => {
  const optionsBackup = JSON.parse(JSON.stringify(options));
  beforeEach(() => {
    yf._opts = JSON.parse(JSON.stringify(optionsBackup));
  });

  it("sets config options and passes validation", () => {
    const configOverrides = { queue: { concurrency: 10, timeout: 90 } };
    yf.setGlobalConfig(configOverrides);
    expect(yf._opts).toEqual({ ...optionsBackup, ...configOverrides });
  });

  it("sets config options multiple levels deep", () => {
    const configOverrides = { queue: { concurrency: 10 } };
    yf.setGlobalConfig(configOverrides);
    expect(yf._opts.queue).toEqual({
      concurrency: 10,
      timeout: optionsBackup.queue.timeout,
    });
  });

  it("should throw on invalid config", () => {
    consoleSilent();

    expect(() => yf.setGlobalConfig({ queue: { abc: "" } })).toThrow(
      /yahooFinance.setGlobalConfig called with invalid options\./,
    );

    consoleRestore();
  });
});
