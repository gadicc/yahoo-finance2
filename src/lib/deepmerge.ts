// deepmerge.ts (Deno-lint friendly)

/** Primitives we never merge */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** A safe callable type (instead of `Function`) */
type AnyFn = (...args: readonly unknown[]) => unknown;

/**
 * Things we do NOT deep-merge (we overwrite instead).
 * Add more here if your domain needs them (URL, Buffer, TypedArrays, etc.)
 */
type NonMergeable =
  | Primitive
  | AnyFn
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | Promise<unknown>
  | readonly unknown[]; // arrays & tuples overwrite

type IsPlainObject<T> = T extends object ? T extends NonMergeable ? false
  : true
  : false;

type Simplify<T> = { [K in keyof T]: T[K] } & Record<PropertyKey, never>;

/** Merge two object types; last wins for non-plain objects */
type MergeTwoTypes<A, B> = IsPlainObject<A> extends true
  ? IsPlainObject<B> extends true ? Simplify<
      {
        [K in keyof A | keyof B]: K extends keyof B
          ? K extends keyof A ? MergeValue<A[K], B[K]>
          : B[K]
          : K extends keyof A ? A[K]
          : never;
      }
    >
  : B
  : B;

type MergeValue<AV, BV> = IsPlainObject<AV> extends true
  ? IsPlainObject<BV> extends true ? MergeTwoTypes<AV, BV>
  : BV
  : BV;

/** Fold a tuple of objects left-to-right */
type DeepMergeTuple<T extends readonly unknown[]> = T extends
  readonly [infer A, ...infer R]
  ? R extends readonly unknown[] ? MergeTwoTypes<A, DeepMergeTuple<R>>
  : A
  : Record<PropertyKey, never>;

export type DeepMergeResult<T extends readonly unknown[]> = Simplify<
  DeepMergeTuple<T>
>;

/* ---------------- Runtime implementation ---------------- */

type AnyRecord = Record<PropertyKey, unknown>;

function isPlainObject(value: unknown): value is AnyRecord {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isUnsafeKey(key: PropertyKey): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function mergeTwo(target: AnyRecord, source: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...target };

  for (const key of Reflect.ownKeys(source)) {
    if (isUnsafeKey(key)) continue;

    const srcVal = source[key];
    const tgtVal = out[key];

    if (isPlainObject(tgtVal) && isPlainObject(srcVal)) {
      out[key] = mergeTwo(tgtVal, srcVal);
    } else {
      // arrays + class instances + dates + maps + everything non-plain: overwrite
      out[key] = srcVal;
    }
  }

  return out;
}

/**
 * Deep merge any number of objects.
 * - Deep merges *plain objects* only.
 * - Overwrites arrays and class instances.
 * - Later args win.
 */
export function deepMerge<const T extends readonly object[]>(
  ...objects: T
): DeepMergeResult<T> {
  let result: AnyRecord = Object.create(null);

  for (const obj of objects) {
    if (!isPlainObject(obj)) {
      // If you pass a non-plain object at the top-level, last wins.
      result = obj as unknown as AnyRecord;
      continue;
    }
    result = mergeTwo(result, obj as unknown as AnyRecord);
  }

  return result as DeepMergeResult<T>;
}
