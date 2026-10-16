// deno-lint-ignore-file no-explicit-any
// This deliberately small compatibility surface preserves the suite's Deno
// .calls[].args contract independently of Bun/Jest mock state and resets.
export function spy<T extends (...args: any[]) => any>(
  fn: T = (() => undefined) as T,
) {
  const calls: {
    args: Parameters<T>;
    self: unknown;
    returned?: ReturnType<T>;
    error?: unknown;
  }[] = [];
  const wrapped = function (
    this: unknown,
    ...args: Parameters<T>
  ): ReturnType<T> {
    const call: typeof calls[number] = { args, self: this };
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
  if (typeof replacement !== "function") {
    throw new TypeError("A stub replacement must be a function");
  }
  const original = Object.getOwnPropertyDescriptor(object, key);
  const wrapped = spy(replacement as (...args: any[]) => any);
  Object.defineProperty(
    object,
    key,
    original && "value" in original ? { ...original, value: wrapped } : {
      value: wrapped,
      configurable: true,
      enumerable: original?.enumerable ?? true,
      writable: true,
    },
  );
  let restored = false;
  const restore = () => {
    if (restored) return;
    if (Object.getOwnPropertyDescriptor(object, key)?.value !== wrapped) {
      throw new Error("Restore stubs in reverse installation order");
    }
    if (original) Object.defineProperty(object, key, original);
    else if (!Reflect.deleteProperty(object, key)) {
      throw new Error("Could not remove stub property");
    }
    restored = true;
  };
  return Object.assign(wrapped, { restore, [Symbol.dispose]: restore });
}
