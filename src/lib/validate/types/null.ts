import { set } from "../index.ts";
import type {
  DataCtx,
  JSONSchema,
  ValidationCtx,
  ValidationError,
  Validator,
} from "../index.ts";

export const _null: Validator = function _null(
  input: unknown,
  _schema: JSONSchema,
  _ctx: ValidationCtx,
  errors: ValidationError[],
  instancePath: string,
  dataCtx: DataCtx | undefined,
  schemaPath: string,
) {
  // YahooFinance type
  if (
    typeof input === "object" &&
    input !== null &&
    Object.keys(input).length === 0
  ) {
    set(dataCtx, null, instancePath);
    return true;
  }

  if (input !== null) {
    errors.push({
      instancePath,
      schemaPath,
      message: "Expected null",
      data: input,
    });
    return false;
  }

  return true;
};
