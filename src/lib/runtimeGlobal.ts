/** The host global is shared by Node, Bun, Deno and Workers. */
export function getRuntimeGlobal(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}
export function getGlobalValue(name: string): unknown {
  try {
    return getRuntimeGlobal()[name];
  } catch {
    // Optional compatibility globals may be accessors that are unavailable here.
    return undefined;
  }
}
