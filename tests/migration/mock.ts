// deno-lint-ignore-file no-explicit-any
// Preserve @std/testing/mock's observed .calls[].args contract without tying
// library assertions to any runner's mock API.
export function spy<T extends (...args: any[]) => any>(
  fn: T = (() => undefined) as T,
) {
  const calls: {
    args: Parameters<T>;
    returned?: ReturnType<T>;
    error?: unknown;
  }[] = [];
  const wrapped = function (
    this: unknown,
    ...args: Parameters<T>
  ): ReturnType<T> {
    const call: typeof calls[number] = { args };
    calls.push(call);
    try {
      return call.returned = fn.apply(this, args);
    } catch (error) {
      call.error = error;
      throw error;
    }
  };
  return Object.assign(wrapped, { calls });
}
export function stub<T extends object, K extends keyof T>(
  object: T,
  key: K,
  replacement: T[K],
) {
  const original = object[key];
  const wrapped = spy(replacement as (...args: any[]) => any);
  object[key] = wrapped as T[K];
  const restore = () => {
    object[key] = original;
  };
  return Object.assign(wrapped, { restore, [Symbol.dispose]: restore });
}
