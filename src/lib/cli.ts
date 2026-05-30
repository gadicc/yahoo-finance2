export const EXIT_OK = 0;
export const EXIT_RUNTIME_ERROR = 1;
export const EXIT_USAGE = 2;

type Print = (...args: unknown[]) => void;
type DirPrint = (
  value: unknown,
  options?: { depth?: number | null; colors?: boolean },
) => void;

export interface CliOutput {
  stdout: Print;
  stderr: Print;
  stdoutDir: DirPrint;
  stderrDir: DirPrint;
}

export interface CliLogger {
  info: Print;
  warn: Print;
  error: Print;
  debug: Print;
  dir: DirPrint;
}

export type CliClient = Record<string, (...args: unknown[]) => unknown>;

export interface RunCliOptions {
  args: string[];
  version: string;
  moduleNames: string[];
  createClient: (logger: CliLogger) => CliClient;
  output?: CliOutput;
  readStdin?: () => string | Promise<string>;
  stdoutIsTerminal?: () => boolean;
}

class CliUsageError extends Error {
  override name = "UsageError";
}

const defaultOutput: CliOutput = {
  stdout: (...args: unknown[]) => console.log(...args),
  stderr: (...args: unknown[]) => console.error(...args),
  stdoutDir: (value, options) => console.dir(value, options),
  stderrDir: (value) => console.error(formatForLog(value)),
};

export function getModuleNames(prototype: object) {
  return Object.getOwnPropertyNames(prototype)
    .filter((name) =>
      name !== "constructor" &&
      !name.startsWith("_") &&
      typeof (prototype as Record<string, unknown>)[name] === "function"
    );
}

export function createCliLogger(output: CliOutput): CliLogger {
  return {
    info: (...args) => output.stderr(...args),
    warn: (...args) => output.stderr(...args),
    error: (...args) => output.stderr(...args),
    debug: () => {},
    dir: (value, options) => output.stderrDir(value, options),
  };
}

function formatForLog(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatHelp(version: string, moduleNames: string[]) {
  return [
    `yahoo-finance2 version: ${version}`,
    "Usage: yahoo-finance <module> [args...]",
    "       yahoo-finance [module] --stdin",
    "",
    "Get a quote for AAPL:",
    "$ yahoo-finance quoteSummary AAPL",
    "",
    "Run the quoteSummary module with two submodules:",
    '$ yahoo-finance quoteSummary AAPL \'{"modules":["assetProfile", "secFilings"]}\'',
    "",
    "Read a call from stdin:",
    '$ echo \'{"query":"AAPL"}\' | yahoo-finance quote --stdin',
    "",
    "Available modules:",
    moduleNames.join(", "),
  ].join("\n");
}

function decodeArg(arg: string, position: number) {
  const firstChar = arg.trimStart()[0];
  if (firstChar === "{" || firstChar === "[") {
    try {
      return JSON.parse(arg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliUsageError(
        `Invalid JSON in argument ${position}: ${message}`,
      );
    }
  }

  if (/^[0-9.]+$/.test(arg)) return Number(arg);

  return arg;
}

function decodeArgs(stringArgs: string[]) {
  return stringArgs.map((arg, index) => decodeArg(arg, index + 2));
}

function splitStdinFlag(args: string[]) {
  const positionalArgs: string[] = [];
  let readFromStdin = false;

  for (const arg of args) {
    if (arg === "--stdin") {
      readFromStdin = true;
    } else {
      positionalArgs.push(arg);
    }
  }

  return { readFromStdin, positionalArgs };
}

function hasOwn(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface StdinCall {
  moduleName?: string;
  args: unknown[];
}

function getStdinModuleName(payload: Record<string, unknown>) {
  if (!hasOwn(payload, "module")) return undefined;

  if (typeof payload.module !== "string") {
    throw new CliUsageError('stdin field "module" must be a string.');
  }

  return payload.module;
}

function decodeStdinPayload(payload: unknown): StdinCall {
  if (Array.isArray(payload)) return { args: payload };
  if (!isRecord(payload)) return { args: [payload] };

  const moduleName = getStdinModuleName(payload);
  const hasModule = hasOwn(payload, "module");
  const hasArgs = hasOwn(payload, "args");
  const hasQuery = hasOwn(payload, "query");
  const hasQueryOptions = hasOwn(payload, "queryOptions");
  const hasModuleOptions = hasOwn(payload, "moduleOptions");

  if (hasArgs) {
    if (hasQuery || hasQueryOptions || hasModuleOptions) {
      throw new CliUsageError(
        'stdin field "args" cannot be combined with "query", "queryOptions", or "moduleOptions".',
      );
    }

    if (!Array.isArray(payload.args)) {
      throw new CliUsageError('stdin field "args" must be an array.');
    }

    return { moduleName, args: payload.args };
  }

  if (hasQuery || hasQueryOptions || hasModuleOptions) {
    if (!hasQuery) {
      throw new CliUsageError(
        'stdin convenience payloads must include "query".',
      );
    }

    const args = [payload.query];
    if (hasQueryOptions || hasModuleOptions) args.push(payload.queryOptions);
    if (hasModuleOptions) args.push(payload.moduleOptions);
    return { moduleName, args };
  }

  if (hasModule) {
    const extraFields = Object.keys(payload).filter((key) => key !== "module");
    if (extraFields.length) {
      throw new CliUsageError(
        'stdin JSON objects with "module" must include "args" or "query"; unexpected fields: ' +
          extraFields.join(", "),
      );
    }

    return { moduleName, args: [] };
  }

  return { args: [payload] };
}

async function readStdinCall(options: RunCliOptions): Promise<StdinCall> {
  if (!options.readStdin) {
    throw new CliUsageError("--stdin is not available in this environment.");
  }

  const input = await options.readStdin();
  if (input.trim() === "") {
    throw new CliUsageError("Missing stdin JSON payload.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(`Invalid JSON from stdin: ${message}`);
  }

  return decodeStdinPayload(payload);
}

function toJsonSafe(value: unknown, stack = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return value.toJSON();

  if (stack.has(value)) {
    throw new Error("Cannot serialize circular result to JSON.");
  }

  stack.add(value);
  try {
    const withToJson = value as { toJSON?: () => unknown };
    if (
      !(value instanceof Map) &&
      !(value instanceof Set) &&
      typeof withToJson.toJSON === "function"
    ) {
      return toJsonSafe(withToJson.toJSON(), stack);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => toJsonSafe(entry, stack));
    }

    if (value instanceof Map) {
      const hasStringKeys = Array.from(value.keys()).every((key) =>
        typeof key === "string"
      );

      if (hasStringKeys) {
        const object: Record<string, unknown> = Object.create(null);
        for (const [key, entry] of value.entries()) {
          object[key as string] = toJsonSafe(entry, stack);
        }
        return object;
      }

      return Array.from(value.entries()).map(([key, entry]) => [
        toJsonSafe(key, stack),
        toJsonSafe(entry, stack),
      ]);
    }

    if (value instanceof Set) {
      return Array.from(value.values()).map((entry) =>
        toJsonSafe(entry, stack)
      );
    }

    const object: Record<string, unknown> = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      object[key] = toJsonSafe(entry, stack);
    }
    return object;
  } finally {
    stack.delete(value);
  }
}

function stringifyResult(result: unknown) {
  return JSON.stringify(toJsonSafe(result), null, 2);
}

function printError(error: unknown, output: CliOutput) {
  if (error instanceof Error) {
    output.stderr(`${error.name}: ${error.message}`);
  } else {
    output.stderr(`Error: ${String(error)}`);
  }
}

function exitCodeForError(error: unknown) {
  if (error instanceof CliUsageError) return EXIT_USAGE;
  if (!(error instanceof Error)) return EXIT_RUNTIME_ERROR;

  if (error.name === "InvalidOptionsError") return EXIT_USAGE;
  if (/expects a single string symbol/.test(error.message)) return EXIT_USAGE;

  return EXIT_RUNTIME_ERROR;
}

export async function runCli(options: RunCliOptions) {
  const output = options.output ?? defaultOutput;
  const stdoutIsTerminal = options.stdoutIsTerminal ?? (() => false);
  const { readFromStdin, positionalArgs } = splitStdinFlag(options.args);
  const [moduleNameFromCli, ...argsAsStrings] = positionalArgs;

  if (moduleNameFromCli === "--help" || moduleNameFromCli === "-h") {
    output.stdout(formatHelp(options.version, options.moduleNames));
    return EXIT_OK;
  }

  if (moduleNameFromCli === "--version" || moduleNameFromCli === "-v") {
    output.stdout(options.version);
    return EXIT_OK;
  }

  let moduleName = moduleNameFromCli;
  let args: unknown[];
  try {
    if (readFromStdin) {
      if (argsAsStrings.length) {
        throw new CliUsageError(
          "--stdin cannot be combined with positional module arguments.",
        );
      }

      const stdinCall = await readStdinCall(options);
      if (stdinCall.moduleName !== undefined) {
        if (moduleName && moduleName !== stdinCall.moduleName) {
          throw new CliUsageError(
            `stdin module "${stdinCall.moduleName}" conflicts with CLI module "${moduleName}".`,
          );
        }
        moduleName = stdinCall.moduleName;
      }
      args = stdinCall.args;
    } else {
      args = decodeArgs(argsAsStrings);
    }
  } catch (error) {
    printError(error, output);
    return exitCodeForError(error);
  }

  if (!moduleName) {
    output.stderr(
      "Missing module.\n\n" + formatHelp(options.version, options.moduleNames),
    );
    return EXIT_USAGE;
  }

  if (!options.moduleNames.includes(moduleName)) {
    output.stderr(`No such module: ${moduleName}`);
    output.stderr("Available modules: " + options.moduleNames.join(", "));
    return EXIT_USAGE;
  }

  let result: unknown;
  try {
    const client = options.createClient(createCliLogger(output));
    const method = client[moduleName];
    if (typeof method !== "function") {
      throw new Error(`Configured module is not callable: ${moduleName}`);
    }
    result = await method.apply(client, args);
  } catch (error) {
    printError(error, output);
    return exitCodeForError(error);
  }

  if (stdoutIsTerminal()) {
    output.stdoutDir(result, { depth: null, colors: true });
  } else {
    try {
      output.stdout(stringifyResult(result));
    } catch (error) {
      printError(error, output);
      return EXIT_RUNTIME_ERROR;
    }
  }

  return EXIT_OK;
}
