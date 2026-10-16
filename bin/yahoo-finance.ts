#!/usr/bin/env node
import YahooFinance from "../src/index.ts";
import pkg from "../deno.json" with { type: "json" };
import {
  type CliClient,
  type CliLogger,
  getModuleNames,
  runCli,
  type RunCliOptions,
} from "../src/lib/cli.ts";
import { createCookieJar, isMainModule, readUtf8 } from "./runtime.ts";

const moduleNames = getModuleNames(YahooFinance.prototype);

function createClient(logger: CliLogger): CliClient {
  return new YahooFinance({
    cookieJar: createCookieJar(),
    logger,
    suppressNotices: ["yahooSurvey"],
  }) as unknown as CliClient;
}

type CliDependencies = Partial<
  Pick<
    RunCliOptions,
    "createClient" | "readStdin" | "stdoutIsTerminal" | "output"
  >
>;

export async function mainCli(
  args = process.argv.slice(2),
  dependencies: CliDependencies = {},
): Promise<number> {
  return await runCli({
    args,
    version: pkg.version,
    moduleNames,
    createClient,
    readStdin: () => readUtf8(),
    stdoutIsTerminal: () => !!process.stdout.isTTY,
    ...dependencies,
  });
}

if (isMainModule(import.meta.url)) {
  void mainCli()
    .then((code) => {
      process.exitCode = code || process.exitCode || 0;
    })
    .catch(() => {
      console.error("Error: Unable to run the Yahoo Finance CLI.");
      process.exitCode = 1;
    });
}
