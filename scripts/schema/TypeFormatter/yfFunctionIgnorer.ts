import {
  type BaseType,
  type Definition,
  FunctionType,
  type SubTypeFormatter,
} from "ts-json-schema-generator";

export default class yfFunctionTypeFormatter implements SubTypeFormatter {
  public supportsType(type: FunctionType): boolean {
    return type instanceof FunctionType;
  }

  public getDefinition(): Definition {
    return {};
  }

  public getChildren(): BaseType[] {
    return [];
  }
}
