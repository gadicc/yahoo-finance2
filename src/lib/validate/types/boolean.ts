import type {
  DataCtx,
  JSONSchema,
  ValidationCtx,
  ValidationError,
  Validator,
} from "../index.ts";

export const boolean: Validator = function boolean(
  input: unknown,
  _schema: JSONSchema,
  _ctx: ValidationCtx,
  errors: ValidationError[],
  instancePath: string,
  _dataCtx: DataCtx | undefined,
  schemaPath: string,
) {
  if (typeof input !== "boolean") {
    errors.push({
      instancePath,
      schemaPath,
      message: "Expected a boolean",
      data: input,
    });
    return false;
  }

  return true;
};
