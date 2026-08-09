import {
  type CompletedConfig,
  createFormatter,
  createParser,
  type createProgram,
  SchemaGenerator,
} from "ts-json-schema-generator";

import yfFunctionIgnorer from "./TypeFormatter/yfFunctionIgnorer.ts";

export default function createSchemaGenerator(
  program: ReturnType<typeof createProgram>,
  config: CompletedConfig,
) {
  const formatter = createFormatter(
    config,
    (chainTypeFormatter, _circularReferenceTypeFormatter) => {
      chainTypeFormatter
        /*
        .addTypeFormatter(
          new yfReferenceTypeFormatter(
            circularReferenceTypeFormatter,
            config.encodeRefs ?? true,
          ),
        )
        .addTypeFormatter(new yfNumberTypeFormatter())
        */
        .addTypeFormatter(new yfFunctionIgnorer());
    },
  );

  const parser = createParser(program, config);
  return new SchemaGenerator(program, parser, formatter, config);
}
