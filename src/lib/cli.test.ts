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
  readStdin?: () => string | Promise<string>,
) {
  return {
    args,
    version: "9.8.7",
    moduleNames: ["quote", "search"],
    createClient,
    output,
    readStdin,
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

Deno.test("runCli decodes JSON array positional arguments", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(
      ["quote", '["AAPL","MSFT"]', '{"return":"object"}'],
      output,
      () => ({
        quote: (...args) => ({ args }),
      }),
    ),
  );

  assertEquals(code, EXIT_OK);
  assertEquals(
    stdout.join("\n"),
    JSON.stringify(
      { args: [["AAPL", "MSFT"], { return: "object" }] },
      null,
      2,
    ),
  );
  assertEquals(stderr.length, 0);
});

Deno.test("runCli reads stdin args payload with module", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(
      ["--stdin"],
      output,
      () => ({
        quote: (...args) => ({ args }),
      }),
      () =>
        JSON.stringify({
          module: "quote",
          args: [
            ["AAPL", "MSFT"],
            { return: "map" },
            { validateOptions: false },
          ],
        }),
    ),
  );

  assertEquals(code, EXIT_OK);
  assertEquals(
    stdout.join("\n"),
    JSON.stringify(
      {
        args: [
          ["AAPL", "MSFT"],
          { return: "map" },
          { validateOptions: false },
        ],
      },
      null,
      2,
    ),
  );
  assertEquals(stderr.length, 0);
});

Deno.test("runCli reads stdin convenience payload with CLI module", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(
      ["quote", "--stdin"],
      output,
      () => ({
        quote: (...args) => ({ args }),
      }),
      () =>
        JSON.stringify({
          query: "AAPL",
          moduleOptions: {
            validateOptions: false,
            validateResult: false,
          },
        }),
    ),
  );

  assertEquals(code, EXIT_OK);
  assertEquals(
    stdout.join("\n"),
    JSON.stringify(
      {
        args: [
          "AAPL",
          null,
          { validateOptions: false, validateResult: false },
        ],
      },
      null,
      2,
    ),
  );
  assertEquals(stderr.length, 0);
});

Deno.test("runCli rejects stdin mixed with positional module args", async () => {
  const { output, stdout, stderr } = createOutput();
  let didReadStdin = false;

  const code = await runCli(
    createRunOptions(
      ["quote", "AAPL", "--stdin"],
      output,
      undefined,
      () => {
        didReadStdin = true;
        return "{}";
      },
    ),
  );

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(!didReadStdin);
  assert(stderr.join("\n").includes("--stdin cannot be combined"));
});

Deno.test("runCli rejects conflicting stdin and CLI modules", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(
      ["quote", "--stdin"],
      output,
      undefined,
      () => JSON.stringify({ module: "search", args: ["AAPL"] }),
    ),
  );

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes('stdin module "search" conflicts'));
});

Deno.test("runCli handles malformed stdin JSON without a stack trace", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(["quote", "--stdin"], output, undefined, () => "{"),
  );

  assertEquals(code, EXIT_USAGE);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("Invalid JSON from stdin"));
  assert(!stderr.join("\n").includes("at JSON.parse"));
});

Deno.test("runCli writes successful module results to stdout only", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(createRunOptions(["quote", "AAPL"], output));

  assertEquals(code, EXIT_OK);
  assertEquals(stdout.join("\n"), JSON.stringify({ ok: true }, null, 2));
  assertEquals(stderr.length, 0);
});

Deno.test("runCli writes Map results as JSON objects", async () => {
  const { output, stdout, stderr } = createOutput();

  const code = await runCli(
    createRunOptions(["quote", "AAPL"], output, () => ({
      quote: () =>
        new Map([
          ["AAPL", { symbol: "AAPL", marketCap: 123n }],
          ["MSFT", { symbol: "MSFT" }],
        ]),
    })),
  );

  assertEquals(code, EXIT_OK);
  assertEquals(
    stdout.join("\n"),
    JSON.stringify(
      {
        AAPL: { symbol: "AAPL", marketCap: "123" },
        MSFT: { symbol: "MSFT" },
      },
      null,
      2,
    ),
  );
  assertEquals(stderr.length, 0);
});

Deno.test("runCli treats circular result serialization as runtime error", async () => {
  const { output, stdout, stderr } = createOutput();
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const code = await runCli(
    createRunOptions(["quote", "AAPL"], output, () => ({
      quote: () => circular,
    })),
  );

  assertEquals(code, EXIT_RUNTIME_ERROR);
  assertEquals(stdout.length, 0);
  assert(stderr.join("\n").includes("Cannot serialize circular result"));
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
