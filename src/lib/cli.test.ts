import {
  type CliClient,
  type CliLogger,
  type CliOutput,
  EXIT_OK,
  EXIT_RUNTIME_ERROR,
  EXIT_USAGE,
  getModuleNames,
  runCli,
} from "./cli.ts";

function assert(
  condition: boolean,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
    );
  }
}

function createOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const output: CliOutput = {
    stdout: (...args) => stdout.push(args.map(String).join(" ")),
    stderr: (...args) => stderr.push(args.map(String).join(" ")),
    stdoutDir: (value) => stdout.push(JSON.stringify(value, null, 2)),
    stderrDir: (value) => stderr.push(JSON.stringify(value, null, 2)),
  };

  return { output, stdout, stderr };
}

function createRunOptions(
  args: string[],
  output: CliOutput,
  createClient: (logger: CliLogger) => CliClient = () => ({
    quote: () => ({ ok: true }),
    search: () => ({ quotes: [] }),
  }),
) {
  return {
    args,
    version: "9.8.7",
    moduleNames: ["quote", "search"],
    createClient,
    output,
    stdoutIsTerminal: () => false,
  };
}

Deno.test("getModuleNames excludes constructor and private members", () => {
  class FakeClient {
    quote() {}
    _private() {}
  }

  assertEquals(getModuleNames(FakeClient.prototype).join(","), "quote");
});

Deno.test("runCli writes help to stdout and exits zero", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions(["--help"], output));

  assertEquals(code, EXIT_OK);
  assert(stdout.join("\n").includes("Usage: yahoo-finance <module>"));
  assertEquals(stderr.length, 0);
});

Deno.test("runCli writes version to stdout and exits zero", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions(["--version"], output));

  assertEquals(code, EXIT_OK);
  assertEquals(stdout.join("\n"), "9.8.7");
  assertEquals(stderr.length, 0);
});

Deno.test("runCli treats missing module as usage error on stderr", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions([], output));

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("Missing module."));
});

Deno.test("runCli treats unknown module as usage error on stderr", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions(["notAModule"], output));

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("No such module: notAModule"));
});

Deno.test("runCli handles malformed JSON without a stack trace", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions(["quote", "{"], output));

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("Invalid JSON in argument 2"));
  assert(!stderr.join("\n").includes("at JSON.parse"));
});

Deno.test("runCli writes successful module results to stdout only", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions(["quote", "AAPL"], output));

  assertEquals(code, EXIT_OK);
  assertEquals(stdout.join("\n"), JSON.stringify({ ok: true }, null, 2));
  assertEquals(stderr.length, 0);
});

Deno.test("runCli routes library diagnostics to stderr", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(
      ["search", "AAPL", '{"invalid":true}'],
      output,
      (logger) => ({
        search: () => {
          logger.error("[yahooFinance.search] Invalid options");
          logger.dir({ input: { invalid: true } });
          const error = new Error(
            "yahooFinance.search called with invalid options.",
          );
          error.name = "InvalidOptionsError";
          throw error;
        },
      }),
    ),
  );

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("[yahooFinance.search] Invalid options"));
  assert(stderr.join("\n").includes('"invalid": true'));
  assert(stderr.join("\n").includes("InvalidOptionsError"));
});

Deno.test("runCli treats runtime failures as runtime errors", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(["quote", "AAPL"], output, () => ({
      quote: () => {
        throw new Error("network unavailable");
      },
    })),
  );

  assertEquals(code, EXIT_RUNTIME_ERROR);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("Error: network unavailable"));
});
