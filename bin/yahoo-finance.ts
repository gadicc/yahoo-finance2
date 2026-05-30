import * as path from "@std/path";
import { FileCookieStore } from "tough-cookie-file-store";

import YahooFinance from "../src/index.ts";
import { ExtendedCookieJar } from "../src/lib/cookieJar.ts";
import pkg from "../deno.json" with { type: "json" };
import {
  type CliClient,
  type CliLogger,
  getModuleNames,
  runCli,
} from "../src/lib/cli.ts";

const moduleNames = getModuleNames(YahooFinance.prototype);
// moduleNames.push("_chart"); // modules in development

function getCookiePath() {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME environment variable is not set");
  return path.join(home, ".yf2-cookies.json");
}

function createClient(logger: CliLogger): CliClient {
  const cookieJar = new ExtendedCookieJar(new FileCookieStore(getCookiePath()));
  return new YahooFinance({
    cookieJar,
    logger,
    suppressNotices: ["yahooSurvey"],
  }) as unknown as CliClient;
}

if (import.meta.main) {
  const exitCode = await runCli({
    args: Deno.args,
    version: pkg.version,
    moduleNames,
    createClient,
    readStdin: () => new Response(Deno.stdin.readable).text(),
    stdoutIsTerminal: () => Deno.stdout.isTerminal(),
  });
  Deno.exit(exitCode);
}
