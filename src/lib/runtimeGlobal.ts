declare const global: Record<string, unknown> | undefined;

export function getRuntimeGlobal(): Record<string, unknown> {
  if (typeof self === "object") {
    return self as unknown as Record<string, unknown>;
  }

  if (typeof global === "object") return global;

  return {};
}

export function getGlobalValue(name: string): unknown {
  return getRuntimeGlobal()[name];
}
