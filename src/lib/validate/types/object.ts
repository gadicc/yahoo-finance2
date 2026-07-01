import validateAndCoerce, { set } from "../index.ts";
import type {
  DataCtx,
  JSONSchema,
  ValidationCtx,
  ValidationError,
  Validator,
} from "../index.ts";

export const object: Validator = function object(
  input: unknown,
  schema: JSONSchema,
  ctx: ValidationCtx,
  errors: ValidationError[],
  instancePath: string,
  dataCtx: DataCtx | undefined,
  schemaPath: string,
  refs?: string[],
) {
  // TwoNumberRange
  if (refs && refs[refs.length - 1] === "TwoNumberRange") {
    /*
  const props = schema.properties;
  if (
    props &&
    //
    props.low && typeof props.low === "object" &&
    props.low.type === "number" &&
    props.high && typeof props.high === "object" &&
    props.high.type === "number" &&
    //
    schema.required &&
    schema.required.length === 2 && schema.required.includes("low") &&
    schema.required.includes("high") &&
    //
    schema.additionalProperties === false
  ) {
  */
    if (
      typeof input === "object" &&
      input !== null &&
      "low" in input &&
      typeof input.low === "number" &&
      "high" in input &&
      typeof input.high === "number"
    ) {
      return true;
    }
    if (typeof input === "string") {
      const parts = input.split("-").map(parseFloat);
      if (Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
        errors.push({
          // keyword: "yahooFinanceType",
          instancePath,
          schemaPath,

          message: "yahooFinanceType: Number.parseFloat returned NaN: [" +
            parts.join(",") +
            "]",
          // params: { schema, data },
          schema,
          data: input,
        });
        return false;
      }
      set(dataCtx, { low: parts[0], high: parts[1] }, instancePath);
      return true;
    }
    errors.push({
      // keyword: "yahooFinanceType",
      instancePath,
      schemaPath,
      message: "TwoNumberRange: Unexpected format",
      // params: { schema, data },
      schema,
      data: input,
    });
    return false;
  }
  // end TwoNumberRange.

  if (typeof input !== "object") {
    console.log({ schemaPath, schema });

    errors.push({
      instancePath,
      schemaPath,
      message: "Expected an object",
      data: input,
    });
    return false;
  }

  const _input = input as Record<string, unknown>;
  const _dataCtx = { parentData: _input, parentDataProperty: "" };

  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in _input)) {
        errors.push({
          instancePath,
          schemaPath: schemaPath + "/required",
          message: "Missing required property",
          data: key,
        });
      }
    }
  }

  for (const [key, value] of Object.entries(_input)) {
    const propSchema = schema.properties?.[key];
    _dataCtx.parentDataProperty = key;

    if (propSchema) {
      validateAndCoerce(
        value,
        propSchema as JSONSchema,
        ctx,
        errors,
        instancePath + "/" + key,
        _dataCtx,
        schemaPath,
      );
    } else {
      if (schema.additionalProperties === false) {
        if (!ctx.allowAdditionalProps) {
          errors.push({
            instancePath,
            schemaPath: schemaPath + "/additionalProperties",
            message: "should NOT have additional properties",
            params: {
              additionalProperty: key,
            },
            data: _input,
          });
        }
      } else if (schema.additionalProperties) {
        validateAndCoerce(
          value,
          schema.additionalProperties as JSONSchema,
          ctx,
          errors,
          instancePath + "/" + key,
          _dataCtx,
          schemaPath + "/additionalProperties",
        );
      }
    }
  }

  return true;
};
