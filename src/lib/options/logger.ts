/**
 * Logger options for {@linkcode YahooFinance}.
 *
 * By default, we use the built-in `console` for logging, but you can override it
 * with anything you like. You can use this to control logging output or send
 * your logs to a logging service.
 *
 * @example
 * ```ts
 * const yahooFinance = new YahooFinance({
 *   logger: {
 *      info: (...args: any[]) => console.log(...args),
 *      warn: (...args: any[]) => console.error(...args),
 *     error: (...args: any[]) => console.error(...args),
 *     debug: (...args: any[]) => console.log(...args),
 *   },
 * });
 */
export interface Logger {
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  info: (...args: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  warn: (...args: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  error: (...args: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  debug: (...args: any[]) => void;
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  dir: (...args: any[]) => void;
}

export const defaultOptions: Logger = {
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  info: (...args: any[]) => console.log(...args),
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  warn: (...args: any[]) => console.warn(...args),
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  error: (...args: any[]) => console.error(...args),
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  dir: (...args: any[]) => console.dir(...args),
  // biome-ignore lint/suspicious/noExplicitAny: Logger callbacks forward arbitrary console-compatible argument lists.
  debug: (..._args: any[]) => {
    // XXX TODO ability to easily toggle this.
    // console.log(...args)
  },
};

export function validateOptions(logger: unknown) {
  if (typeof logger !== "object" || logger === null) {
    throw new Error("logger must be an object");
  }
  for (const method of ["info", "warn", "error", "debug", "dir"]) {
    if (!(method in (logger as Record<string, unknown>))) {
      throw new Error(`logger.${method} is required`);
    }
    if (typeof (logger as Record<string, unknown>)[method] !== "function") {
      throw new Error(`logger.${method} must be a function`);
    }
  }
}
