import { it as nativeIt } from "bun:test";
import { sprintf } from "sprintf-js";
export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  it as test,
} from "bun:test";
export type TestContext = unknown;
export type FinishCallback = (error?: unknown) => void | Promise<void>;
export type TestBody = (
  context: TestContext,
  onFinish: (callback: FinishCallback) => void,
) => void | PromiseLike<void>;

/** One invocation owns its callbacks, including when Bun repeats a test. */
export async function runTest(body: TestBody, context?: TestContext) {
  const callbacks: FinishCallback[] = [];
  let finished = false;
  let failed = false;
  let bodyError: unknown;
  try {
    const result = body(context, (callback) => {
      if (finished) {
        throw new Error("onFinish registered after the test finished");
      }
      callbacks.push(callback);
    });
    if (
      result !== undefined &&
      (result === null || typeof result.then !== "function")
    ) {
      throw new TypeError("Test body must return undefined or a promise");
    }
    await result;
  } catch (error) {
    failed = true;
    bodyError = error;
  }
  finished = true;
  const errors: unknown[] = failed ? [bodyError] : [];
  // Drain every callback once, in registration order, even if cleanup fails.
  // Each sees the body result, never an earlier cleanup callback's failure.
  for (const callback of callbacks) {
    try {
      await callback(bodyError);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Test body or onFinish callbacks failed");
  }
}

type EachTable = ReadonlyArray<unknown | ReadonlyArray<unknown>>;
// Table rows determine the callback arguments at runtime.
// deno-lint-ignore no-explicit-any
type EachTestBody = (...args: any[]) => void | PromiseLike<void>;

function each(table: EachTable) {
  return (name: string, body: EachTestBody, timeout?: number) => {
    for (const item of table) {
      const row = Array.isArray(item) ? item : [item];
      projectIt(
        sprintf(name, ...row),
        (context, onFinish) => body(...row, context, onFinish),
        timeout,
      );
    }
  };
}

/** Keep project context separate: Bun treats callback parameters as done. */
export const projectIt = Object.assign(
  (name: string, body: TestBody, timeout?: number) => {
    nativeIt(name, () => runTest(body), timeout);
  },
  { each },
);
