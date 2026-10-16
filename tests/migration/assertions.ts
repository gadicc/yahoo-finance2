import { expect as base } from "expect";
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
