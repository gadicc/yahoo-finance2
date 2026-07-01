import pkg from "../../deno.json" with { type: "json" };
import { FailedYahooValidationError, InvalidOptionsError } from "./errors.ts";

import validateAndCoerce from "./validate/index.ts";
import { repository } from "../consts.ts";
import type { JSONSchema, ValidationError } from "./validate/index.ts";
import type { Logger } from "./options/logger.ts";
import { versionCheck as execVersionCheck } from "./versions.ts";

export function resolvePath(
  obj: Record<string, unknown>,
  instancePath: string,
) {
  const path = instancePath.split("/");
  let ref = obj;
  for (let i = 1; i < path.length; i++) {
    ref = ref[path[i]] as Record<string, unknown>;
  }
  return ref;
}

export interface ValidationOptions {
  logErrors?: boolean;
  logOptionsErrors?: boolean;
  allowAdditionalProps?: boolean;
}

export interface ValidateParams {
  source: string;
  type: "options" | "result";
  object: object;
  definitions: JSONSchema["definitions"];
  schemaOrSchemaKey: JSONSchema | string;
  options: ValidationOptions;
  logger: Logger;
  logObj: (obj: unknown, opts?: { depth?: number }) => void;
  versionCheck: boolean;
}

const doneAlready = new Map();

function disallowAdditionalProps(
  definitions: Record<string, unknown>,
  show = false,
) {
  if (doneAlready.has(definitions)) return;
  doneAlready.set(definitions, true);

  const disallowed = new Set();
  for (const key of Object.keys(definitions)) {
    if (key.match(/Options$/)) {
      continue;
    }

    const def = definitions[key] as JSONSchema;
    if (def.type === "object") {
      if (
        def.additionalProperties === undefined ||
        typeof def.additionalProperties === "object" &&
          Object.keys(def.additionalProperties).length === 0
      ) {
        def.additionalProperties = false;
        disallowed.add(key);
      }
    }
  }
  /* istanbul ignore next */
  if (show) {
    console.log(
      "Disallowed additional props in " + Array.from(disallowed).join(", "),
    );
  }
}

function aggregateErrors(inputErrors: ValidationError[]) {
  const missingMap = new Map<string, ValidationError[]>();
  const additionalMap = new Map<string, ValidationError[]>();

  const errors = inputErrors.filter((error) => {
    if (error.subErrors) {
      error.subErrors = aggregateErrors(error.subErrors);
    }

    if (error.schemaPath) {
      const key = error.schemaPath + "|" + error.instancePath;

      if (error.message === "Missing required property") {
        let arr: ValidationError[];
        if (missingMap.has(key)) {
          arr = missingMap.get(key)!;
        } else {
          arr = [];
          missingMap.set(key, arr);
        }
        arr.push(error);
        return false;
      } else if (error.message === "should NOT have additional properties") {
        let arr: ValidationError[];
        if (additionalMap.has(key)) {
          arr = additionalMap.get(key)!;
        } else {
          arr = [];
          additionalMap.set(key, arr);
        }
        arr.push(error);
        return false;
      }
    }

    return true;
  });

  for (const arr of missingMap.values()) {
    const missing: string[] = [];
    for (const error of arr) {
      missing.push(error.data as string || "somethingWentWrong(tm)");
    }
    errors.push({
      schemaPath: arr[0].schemaPath,
      instancePath: arr[0].instancePath,
      message: "Missing required properties",
      params: { missing },
    });
  }

  for (const arr of additionalMap.values()) {
    const additionalProperties: Record<string, unknown> = {};
    for (const error of arr) {
      const additionalProperty = error.params?.additionalProperty as string ||
        "somethingWentWrong(tm)";
      additionalProperties[
        additionalProperty
      ] = (error.data as Record<string, unknown>)[additionalProperty];
    }
    errors.push({
      schemaPath: arr[0].schemaPath,
      instancePath: arr[0].instancePath,
      message: "should NOT have additional properties",
      params: { additionalProperties },
    });
  }

  return errors;
}

function validate({
  source,
  type,
  object,
  schemaOrSchemaKey,
  definitions,
  options,
  logger,
  logObj,
  versionCheck,
}: ValidateParams): void {
  const _errors = validateAndCoerce(
    object,
    schemaOrSchemaKey,
    {
      definitions,
      logger,
      logObj,
      allowAdditionalProps: type === "result" && options.allowAdditionalProps,
    },
  );
  // if (_errors === false || !_errors.length) return;
  if (_errors.length === 0) return;

  const errors = aggregateErrors(_errors);

  if (type === "result") {
    /* istanbul ignore else */
    /*
    if (errors) {
      let origData: any = false;

      errors.forEach((error) => {
        // For now let's ignore the base object which could be huge.
        /* istanbul ignore else */
    /*
        if (error.instancePath !== "")
          // Note, not the regular ajv data value from verbose:true
          error.data = resolvePath(object, error.instancePath);

        if (error.schemaPath === "#/anyOf") {
          if (origData === false) {
            origData = error.data;
          } else if (origData === error.data) {
            error.data = "[shortened by validateAndCoerceTypes]";
          }
        }
      });

      // Becaue of the "anyOf" in quote, errors are huuuuge and mostly
      // irrelevant... so let's filter out (some of) the latter
      errors = errors.filter((error) => {
        if (error.schemaPath.startsWith("#/definitions/Quote")) {
          const schemaQuoteType = error.schemaPath
            .substring(19)
            .split("/")[0]
            .toUpperCase();

          /*
           * Filter out entries for non-matching schema type, i.e.
           * {
           *   schemaPath: '#/definitions/QuoteCryptoCurrency/properties...'
           *   data: {
           *     quoteType: "EQUITY"
           *   }
           * }
           */
    /*
          if (
            typeof error.data === "object" &&
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore: Properrty "quoteType" does not exist on type "object"
            error.data?.quoteType !== schemaQuoteType
          )
            return false;

          /*
           * Filter out the non-matching "const" for the above.
           * {
           *   schemaPath: '#/definitions/QuoteCryptoCurrency/properties/quoteType/const'
           *   keyword: "const",
           *   params: { allowedValue: "CRYPTOCURRENCY"}},
           *   data: "EQUITY"
           * }
           */
    /*
          if (
            typeof error.data === "string" &&
            error.params?.allowedValue === schemaQuoteType
          )
            return false;
        }
        return true;
      });

      // In the case of there being NO match in #anyOf, bring back the data
      if (errors.length === 1 && errors[0].schemaPath === "#/anyOf")
        errors[0].data = origData;
    }
    */

    if (options.logErrors === true) {
      const title = encodeURIComponent(
        "Failed validation: " + schemaOrSchemaKey,
      );
      logger.error(
        "The following result did not validate with schema: " +
          schemaOrSchemaKey,
      );
      logObj(errors, { depth: 5 });
      // logObj(object);
      logger.error(`
This may happen intermittently and you should catch errors appropriately.  However:  1) if this recently started happening on every request for a symbol that used to work, Yahoo may have changed their API.  2) If this happens on every request for a symbol you've never used before, but not for other symbols, you've found an edge-case (OR, we may just be protecting you from "bad" data sometimes stored for e.g. misspelt symbols on Yahoo's side).

Please see if anyone has reported this previously:

  ${repository}/issues?q=is%3Aissue+${title}

or open a new issue (and mention the symbol):  ${pkg.name} v${pkg.version}

  ${repository}/issues/new?labels=bug%2C+validation&template=validation.md&title=${title}

For information on how to turn off the above logging or skip these errors, see https://github.com/gadicc/yahoo-finance2/tree/devel/docs/validation.md.

At the end of the doc, there's also a section on how to "Help Fix Validation Errors" in case you'd like to contribute to the project.  Most of the time, these fixes are very quick and easy; it's just hard for our small core team to keep up, so help is always appreciated!
`);
      if (versionCheck) {
        execVersionCheck().then((result) => {
          if (!result.isLatest) {
            logger.info(
              `Additionally, your yahoo-finance2 version out of date: ${result.current} < ${result.latest} (latest)`,
            );
          }
        }).catch((error) => {
          logger.error(`Failed to check version: ${error.message}`);
        });
      }
    } /* if (logErrors) */

    throw new FailedYahooValidationError("Failed Yahoo Schema validation", {
      result: object,
      errors: errors,
    });
  } /* if (type === 'options') */ else {
    if (options.logOptionsErrors === true) {
      logger.error(
        `[yahooFinance.${source}] Invalid options ("${schemaOrSchemaKey}")`,
      );
      logObj({ errors, input: object });
    }

    throw new InvalidOptionsError(
      `yahooFinance.${source} called with invalid options.`,
    );
  }
}

export { disallowAdditionalProps };
export default validate;
