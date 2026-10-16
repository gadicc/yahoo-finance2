import { createRequire } from "node:module";
// Bun 1.4.2 exposes undefined named exports via expect's ESM wrapper.
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
// Preserve the optional Deno message signature; Jest accepts only one argument.
export const expect = Object.assign(
  (actual: unknown, _message?: string) => base(actual),
  base,
);
