export function toJsonSafe(
  value: unknown,
  stack = new WeakSet<object>(),
): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return value.toJSON();

  if (stack.has(value)) {
    throw new Error("Cannot serialize circular result to JSON.");
  }

  stack.add(value);
  try {
    const withToJson = value as { toJSON?: () => unknown };
    if (
      !(value instanceof Map) &&
      !(value instanceof Set) &&
      typeof withToJson.toJSON === "function"
    ) {
      return toJsonSafe(withToJson.toJSON(), stack);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => toJsonSafe(entry, stack));
    }

    if (value instanceof Map) {
      const hasStringKeys = Array.from(value.keys()).every((key) =>
        typeof key === "string"
      );

      if (hasStringKeys) {
        const object: Record<string, unknown> = Object.create(null);
        for (const [key, entry] of value.entries()) {
          object[key as string] = toJsonSafe(entry, stack);
        }
        return object;
      }

      return Array.from(value.entries()).map(([key, entry]) => [
        toJsonSafe(key, stack),
        toJsonSafe(entry, stack),
      ]);
    }

    if (value instanceof Set) {
      return Array.from(value.values()).map((entry) =>
        toJsonSafe(entry, stack)
      );
    }

    const object: Record<string, unknown> = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      object[key] = toJsonSafe(entry, stack);
    }
    return object;
  } finally {
    stack.delete(value);
  }
}

export function stringifyJsonSafe(value: unknown, space = 2) {
  return JSON.stringify(toJsonSafe(value), null, space);
}
