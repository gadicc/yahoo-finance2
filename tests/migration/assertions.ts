import { createRequire } from "node:module";
// Bun exposes undefined named exports via expect's ESM wrapper.
// Its CommonJS entry retains the same Jest assertion implementation as Node.
const { expect: base } = createRequire(import.meta.url)(
  "expect",
) as typeof import("expect");
import type { getType } from "jest-get-type";
declare module "expect" {
  interface Matchers<R extends void | Promise<void>, T = unknown> {
    toBeType(type: ReturnType<typeof getType>): R;
  }
}
/** Add Deno's optional diagnostic without changing Jest matcher semantics. */
function withMessage<T extends object>(matchers: T, message: string): T {
  const annotate = (error: unknown): never => {
    if (error instanceof Error) {
      error.message = `${message}\n\n${error.message}`;
    }
    throw error;
  };
  return new Proxy(matchers, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (
        (key === "not" || key === "resolves" || key === "rejects") &&
        typeof value === "object" && value !== null
      ) {
        return withMessage(value, message);
      }
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        try {
          const result = Reflect.apply(value, target, args);
          const thenable = result !== null &&
            (typeof result === "object" || typeof result === "function") &&
            typeof result.then === "function";
          return thenable ? Promise.resolve(result).catch(annotate) : result;
        } catch (error) {
          return annotate(error);
        }
      };
    },
  });
}

export const expect = Object.assign(
  (actual: unknown, message?: string) => {
    const matchers = base(actual);
    return message === undefined ? matchers : withMessage(matchers, message);
  },
  base,
);
