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

function ensurePrivateFile(filePath: string) {
  try {
    Deno.writeTextFileSync(filePath, "", { createNew: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
  try {
    Deno.chmodSync(filePath, 0o600);
  } catch {
    // chmod is unsupported on Windows; best-effort only.
  }
}

function createClient(logger: CliLogger): CliClient {
  const cookiePath = getCookiePath();
  ensurePrivateFile(cookiePath);
  const cookieJar = new ExtendedCookieJar(new FileCookieStore(cookiePath));
  return new YahooFinance({
    cookieJar,
    logger,
    suppressNotices: ["yahooSurvey"],
  }) as unknown as CliClient;
}

async function main() {
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

if (import.meta.main) {
  main();
}
