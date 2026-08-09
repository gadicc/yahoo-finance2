import options, { type OptionsResult } from "./options.ts";
import type { ModuleThis } from "../lib/moduleCommon.ts";

function characterizeOptionsOverloads() {
  const receiver = { options } as ModuleThis & { options: typeof options };
  const defaultResult: Promise<OptionsResult> = receiver.options("AAPL");
  const validatedResult: Promise<OptionsResult> = receiver.options(
    "AAPL",
    undefined,
    { validateResult: true },
  );

  // @ts-expect-error: disabling validation intentionally returns unknown data.
  const unvalidatedResult: Promise<OptionsResult> = receiver.options(
    "AAPL",
    undefined,
    { validateResult: false },
  );

  return [defaultResult, validatedResult, unvalidatedResult];
}

void characterizeOptionsOverloads;

Deno.test("options overloads discriminate on validateResult", () => {});
