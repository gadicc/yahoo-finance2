import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import {
  type CompletedConfig,
  type Config,
  ts,
} from "ts-json-schema-generator";

import moduleOptionsSchema from "../../src/lib/options/options.schema.json" with {
  type: "json",
};
import optionsSchema from "../../src/modules/options.schema.json" with {
  type: "json",
};
import createSchemaGenerator from "./createGenerator.ts";

type Schema = {
  $ref?: string;
  const?: unknown;
  definitions?: Record<string, Schema>;
  properties?: Record<string, Schema>;
  required?: string[];
  type?: string;
  [key: string]: unknown;
};

const moduleOptionsSource = `
  export interface YahooFinanceFetchModuleOptions {
    fetch?: () => void;
    queue?: { concurrency?: number };
  }

  export interface ModuleOptions extends YahooFinanceFetchModuleOptions {
    validateOptions?: boolean;
    validateResult?: boolean;
  }

  export interface ModuleOptionsWithValidateFalse extends ModuleOptions {
    validateResult: false;
  }

  export interface ModuleOptionsWithValidateTrue extends ModuleOptions {
    validateResult?: true;
  }
`;

function createVirtualProgram() {
  const fileName = "/module-options.ts";
  const compilerOptions: ts.CompilerOptions = {
    noLib: true,
    strictNullChecks: true,
    target: ts.ScriptTarget.ES2022,
  };
  const sourceFile = ts.createSourceFile(
    fileName,
    moduleOptionsSource,
    compilerOptions.target!,
    true,
  );
  const host: ts.CompilerHost = {
    fileExists: (path) => path === fileName,
    getCanonicalFileName: (path) => path,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "",
    getNewLine: () => "\n",
    getSourceFile: (path) => path === fileName ? sourceFile : undefined,
    readFile: (path) => path === fileName ? moduleOptionsSource : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  };

  return ts.createProgram([fileName], compilerOptions, host);
}

function collectReferences(value: unknown, references: string[] = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectReferences(child, references);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        references.push(child);
      } else {
        collectReferences(child, references);
      }
    }
  }
  return references;
}

describe("schema generator integration", () => {
  it("preserves module option literal discrimination", () => {
    const config = {
      path: "/module-options.ts",
      type: [
        "ModuleOptions",
        "ModuleOptionsWithValidateFalse",
        "ModuleOptionsWithValidateTrue",
      ],
      discriminatorType: "open-api",
      additionalProperties: false,
      jsDoc: "basic",
      expose: "export",
      topRef: true,
    } as Config as CompletedConfig;
    const schema = createSchemaGenerator(createVirtualProgram(), config)
      .createSchema(config.type) as Schema;
    const definitions = schema.definitions!;
    const base = definitions.ModuleOptions;
    const falseOptions = definitions.ModuleOptionsWithValidateFalse;
    const trueOptions = definitions.ModuleOptionsWithValidateTrue;

    expect(base.properties?.validateResult).toEqual({ type: "boolean" });
    expect(falseOptions.properties?.validateResult).toEqual({
      type: "boolean",
      const: false,
    });
    expect(falseOptions.required).toContain("validateResult");
    expect(trueOptions.properties?.validateResult).toEqual({
      type: "boolean",
      const: true,
    });
    expect(trueOptions.required ?? []).not.toContain("validateResult");

    for (const definition of [base, falseOptions, trueOptions]) {
      expect(definition.properties?.fetch).toEqual({});
      expect(definition.properties?.queue?.type).toBe("object");
      expect(definition.properties?.validateOptions).toEqual({
        type: "boolean",
      });
    }
  });

  it("retains the module options used by the public options schema", () => {
    const definitions = moduleOptionsSchema.definitions as Record<
      string,
      Schema
    >;
    const moduleOptions = definitions.ModuleOptions;
    const fetchOptions = definitions.YahooFinanceFetchModuleOptions;

    expect(moduleOptions.properties?.validateResult).toEqual({
      type: "boolean",
    });
    expect(moduleOptions.properties?.validateOptions).toEqual({
      type: "boolean",
    });
    expect(moduleOptions.properties?.queue).toEqual({
      $ref: "#/definitions/QueueOptions",
    });
    expect(fetchOptions.properties?.queue).toEqual({
      $ref: "#/definitions/QueueOptions",
    });
  });

  it("prunes definitions that are not public roots or referenced children", () => {
    const publicDefinitions = moduleOptionsSchema.definitions as Record<
      string,
      Schema
    >;
    const resultDefinitions = optionsSchema.definitions as Record<
      string,
      Schema
    >;

    expect(publicDefinitions.ModuleOptionsWithValidateFalse).toBeUndefined();
    expect(publicDefinitions.ModuleOptionsWithValidateTrue).toBeUndefined();
    expect(publicDefinitions.ModuleThis).toBeUndefined();
    expect(publicDefinitions.ModuleError).toBeUndefined();
    expect(resultDefinitions.QuoteBase).toBeUndefined();

    expect(resultDefinitions.OptionsResult.properties?.quote).toEqual({
      $ref: "#/definitions/Quote",
    });
    expect(resultDefinitions.QuoteEquity.properties?.language).toEqual({
      type: "string",
    });
  });

  it("does not leave dangling references after pruning", () => {
    for (const schema of [moduleOptionsSchema, optionsSchema]) {
      const definitions = schema.definitions as Record<string, Schema>;
      for (const reference of collectReferences(schema)) {
        const name = reference.match(/^#\/definitions\/(.+)$/)?.[1];
        expect(name, `unsupported reference: ${reference}`).toBeDefined();
        expect(definitions[name!], `missing definition: ${name}`).toBeDefined();
      }
    }
  });
});
