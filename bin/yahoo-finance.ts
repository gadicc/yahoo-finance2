import * as path from "@std/path";
import { FileCookieStore } from "tough-cookie-file-store";

import YahooFinance from "../src/index.ts";
import { ExtendedCookieJar } from "../src/lib/cookieJar.ts";
import pkg from "../deno.json" with { type: "json" };
import { versionCheck } from "../src/lib/versions.ts";

const cookiePath = path.join(Deno.env.get("HOME")!, ".yf2-cookies.json");
const cookieJar = new ExtendedCookieJar(new FileCookieStore(cookiePath));

const yahooFinance = new YahooFinance({
  cookieJar,
  suppressNotices: ["yahooSurvey"],
});

const moduleNames = Object.getOwnPropertyNames(YahooFinance.prototype)
  .filter((n) => !n.startsWith("_"));
// moduleNames.push("_chart"); // modules in development

const [moduleName, ...argsAsStrings] = Deno.args;

function decodeArgs(stringArgs: string[]) {
  return stringArgs.map((arg) => {
    if (arg[0] === "{") return JSON.parse(arg);

    if (arg.match(/^[0-9\.]+$/)) return Number(arg);

    return arg;
  });
}

(async function () {
  if (!moduleName || moduleName === "--help" || moduleName === "-h") {
    console.error("yahoo-finance2 version: " + pkg.version);
    console.error("Usage: yahoo-finance.js <module> <args>");
    console.error();
    console.error("Get a quote for AAPL:");
    console.error("$ yahoo-finance.js quoteSummary AAPL");
    console.error();
    console.error("Run the quoteSummary module with two submodules:");
    console.error(
      '$ yahoo-finance.js quoteSummary AAPL \'{"modules":["assetProfile", "secFilings"]}\'',
    );
    console.error();
    console.error("Available modules:");
    console.error(moduleNames.join(", "));
    Deno.exit(1);
  }

  if (moduleName === "--version" || moduleName === "-v") {
    const versions = await versionCheck();
    console.error(
      `yahoo-finance2 version: ${versions.current} (latest` +
        (versions.isLatest ? "" : `: ${versions.latest}`) + ")",
    );

    Deno.exit(1);
  }

  if (!moduleNames.includes(moduleName)) {
    console.error("No such module: " + moduleName);
    console.error("Available modules: " + moduleNames.join(", "));
    Deno.exit(1);
  }

  console.error("Storing cookies in " + cookiePath);

  const args = decodeArgs(argsAsStrings);

  let result;
  try {
    // @ts-expect-error: yes, string is a bad index.
    result = await yahooFinance[moduleName](...args);
  } catch (error) {
    if (error instanceof Error) {
      // No need for full stack trace for CLI scripts
      console.error("Exiting with " + error.name + ": " + error.message);
    } else {
      console.error("Exiting with error: " + error);
    }
    Deno.exit(1);
  }

  if (Deno.stdout.isTerminal()) {
    console.dir(result, { depth: null, colors: true });
  } else console.log(JSON.stringify(result, null, 2));
})();
