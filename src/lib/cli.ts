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
    "",
    "Get a quote for AAPL:",
    "$ yahoo-finance quoteSummary AAPL",
    "",
    "Run the quoteSummary module with two submodules:",
    '$ yahoo-finance quoteSummary AAPL \'{"modules":["assetProfile", "secFilings"]}\'',
    "",
    "Available modules:",
    moduleNames.join(", "),
  ].join("\n");
}

function decodeArg(arg: string, position: number) {
  if (arg[0] === "{") {
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
  const [moduleName, ...argsAsStrings] = options.args;

  if (moduleName === "--help" || moduleName === "-h") {
    output.stdout(formatHelp(options.version, options.moduleNames));
    return EXIT_OK;
  }

  if (moduleName === "--version" || moduleName === "-v") {
    output.stdout(options.version);
    return EXIT_OK;
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

  let args: unknown[];
  try {
    args = decodeArgs(argsAsStrings);
  } catch (error) {
    printError(error, output);
    return exitCodeForError(error);
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
    output.stdout(JSON.stringify(result, null, 2));
  }

  return EXIT_OK;
}
