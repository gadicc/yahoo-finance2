export interface Logger {
  // deno-lint-ignore no-explicit-any
  info: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  warn: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  error: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  debug: (...args: any[]) => void;
  // deno-lint-ignore no-explicit-any
  dir: (...args: any[]) => void;
}

export const defaultOptions: Logger = {
  // deno-lint-ignore no-explicit-any
  info: (...args: any[]) => console.log(...args),
  // deno-lint-ignore no-explicit-any
  warn: (...args: any[]) => console.warn(...args),
  // deno-lint-ignore no-explicit-any
  error: (...args: any[]) => console.error(...args),
  // deno-lint-ignore no-explicit-any
  dir: (...args: any[]) => console.dir(...args),
  // deno-lint-ignore no-explicit-any
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
