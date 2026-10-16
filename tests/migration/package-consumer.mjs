// Copy this probe into a fresh consumer directory beside its installed node_modules.
// Run only under scripts/testing/offline.py; installation is a separate step.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const installed = join(root, "node_modules/yahoo-finance2");
assert(!lstatSync(join(root, "node_modules")).isSymbolicLink());
assert(!lstatSync(installed).isSymbolicLink());
assert.equal(realpathSync(installed), installed);
const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
const names = [
  "./src/index.ts",
  ".",
  "./createYahooFinance",
  "./mcp",
  "./mcp/http",
  "./mcp/server",
  "./modules",
  "./modules/autoc",
  "./modules/chart",
  "./modules/dailyGainers",
  "./modules/dailyLosers",
  "./modules/fundamentalsTimeSeries",
  "./modules/historical",
  "./modules/insights",
  "./modules/options",
  "./modules/quoteSummary-iface",
  "./modules/quoteSummary",
  "./modules/quote",
  "./modules/recommendationsBySymbol",
  "./modules/screener",
  "./modules/search",
  "./modules/trendingSymbols",
  "./other",
  "./other/quoteCombine",
  "./lib/moduleCommon",
  "./lib/cookieJar",
  "./lib/getCrumb",
  "./lib/options",
];
assert.deepEqual(Object.keys(pkg.exports), names);
assert.equal(pkg.dependencies["fetch-mock-cache"], undefined);
assert.equal(pkg.dependencies["@types/json-schema"], "^7.0.15");
assert.equal(pkg.engines.node, ">=22.0.0");
const imports = new Map();
const requires = new Map();
const typeOnly = new Set(["./lib/moduleCommon"]);
for (const name of names) {
  const specifier =
    name === "." ? "yahoo-finance2" : "yahoo-finance2/" + name.slice(2);
  const esm = await import(specifier);
  const cjs = require(specifier);
  assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort(), name);
  assert.equal(Object.keys(esm).length === 0, typeOnly.has(name), name);
  if ("default" in esm) assert.equal(typeof esm.default, "function", name);
  imports.set(name, esm);
  requires.set(name, cjs);
  assert.match(require.resolve(specifier), /\/script\/src\/.*\.js$/);
  if (typeof import.meta.resolve === "function")
    assert.match(import.meta.resolve(specifier), /\/esm\/src\/.*\.js$/);
}
assert.equal(
  imports.get("./modules/quoteSummary-iface").Grade.StrongBuy,
  "Strong Buy",
);
const quote = {
  symbol: "PACKED",
  language: "en-US",
  region: "US",
  quoteType: "EQUITY",
  triggerable: false,
  marketState: "REGULAR",
  tradeable: true,
  exchange: "NMS",
  exchangeTimezoneName: "America/New_York",
  exchangeTimezoneShortName: "EDT",
  gmtOffSetMilliseconds: -14400000,
  market: "us_market",
  esgPopulated: false,
  sourceInterval: 15,
  exchangeDataDelayedBy: 0,
  fullExchangeName: "NasdaqGS",
  regularMarketPrice: 123.45,
  regularMarketTime: 1700000000,
};
let fetchCalls = 0;
for (const modules of [imports, requires]) {
  const YahooFinance = modules.get(".").default;
  assert.equal(modules.get("./src/index.ts").default, YahooFinance);
  const { ExtendedCookieJar } = modules.get("./lib/cookieJar");
  const cookieJar = new ExtendedCookieJar();
  await cookieJar.setCookie("crumb=packed-crumb; Path=/", "http://config.yf2/");
  await cookieJar.setCookie(
    "A1=packed-cookie; Domain=.yahoo.com; Path=/",
    "https://finance.yahoo.com/",
  );
  const client = new YahooFinance({
    cookieJar,
    versionCheck: false,
    suppressNotices: ["yahooSurvey"],
    /** @param {RequestInfo | URL} input @param {RequestInit} init */
    fetch: async (input, init) => {
      fetchCalls++;
      const url = new URL(String(input));
      assert.equal(url.hostname, "query2.finance.yahoo.com");
      assert.equal(url.pathname, "/v7/finance/quote");
      assert.equal(url.searchParams.get("symbols"), "PACKED");
      assert.equal(url.searchParams.get("crumb"), "packed-crumb");
      assert.match(
        /** @type {string} */ (new Headers(init.headers).get("User-Agent")),
        new RegExp(pkg.version.replaceAll(".", "\\.")),
      );
      return Response.json({ quoteResponse: { result: [quote], error: null } });
    },
  });
  const result = await client.quote("PACKED");
  assert.equal(result.symbol, "PACKED");
  assert.equal(result.regularMarketPrice, 123.45);
  assert(result.regularMarketTime instanceof Date);
  assert.equal(
    result.regularMarketTime.toISOString(),
    "2023-11-14T22:13:20.000Z",
  );
  assert.throws(
    () =>
      new YahooFinance({
        definitelyNotAnOption: true,
        logger: { info() {}, debug() {}, warn() {}, error() {} },
      }),
  );
  const { getYahooFinanceMcpToolNames, createYahooFinanceMcpServer } =
    modules.get("./mcp/server");
  assert(getYahooFinanceMcpToolNames().includes("quote"));
  const server = createYahooFinanceMcpServer({
    client: { quote: async () => result },
    enabledTools: ["quote"],
  });
  await server.close();
  const handler = modules
    .get("./mcp/http")
    .createYahooFinanceMcpWebHandler({ client: {}, enabledTools: [] });
  assert.equal(
    (await handler(new Request("http://localhost/missing"))).status,
    404,
  );
  const Custom = modules
    .get("./createYahooFinance")
    .default({ modules: { quote: modules.get("./modules/quote").default } });
  assert.equal(typeof new Custom().quote, "function");
}
assert.equal(fetchCalls, 2);

// Generate genuine consumer files, using the installed package's own conditions.
for (const extension of ["mts", "cts"]) {
  const lines = names.map((name, index) => {
    const specifier =
      name === "." ? "yahoo-finance2" : "yahoo-finance2/" + name.slice(2);
    return extension === "mts"
      ? `import * as p${index} from ${JSON.stringify(specifier)};`
      : `import p${index} = require(${JSON.stringify(specifier)});`;
  });
  const mainIndex = names.indexOf(".");
  lines.push(
    `const client = new p${mainIndex}.default({ versionCheck: false, fetch: async () => Response.json({}) });`,
  );
  lines.push(`async function types() {
    const quote = await client.quote("AAPL");
    const symbol: string = quote.symbol;
    const many = await client.quote(["AAPL"]);
    const first: string = many[0].symbol;
    const map = await client.quote(["AAPL"], { return: "map" });
    const same: string | undefined = map.get("AAPL")?.symbol;
    const chart = await client.chart("AAPL", { period1: "2020-01-01" });
    const time: Date = chart.quotes[0].date;
    // @ts-expect-error public options must remain checked
    client.quote("AAPL", { definitelyNotAnOption: true });
    return { symbol, first, same, time };
  }`);
  lines.push(
    `const handler: p${names.indexOf("./mcp/http")}.YahooFinanceMcpWebHandler = p${names.indexOf("./mcp/http")}.createYahooFinanceMcpWebHandler({ client: {} });`,
  );
  lines.push(
    `const cookieJar = new p${names.indexOf("./lib/cookieJar")}.ExtendedCookieJar();`,
  );
  lines.push(
    `const options: p${names.indexOf("./lib/options")}.YahooFinanceOptions = { cookieJar };`,
  );
  lines.push(
    `const profile: Pick<p${names.indexOf("./modules/quoteSummary-iface")}.AssetProfile, "website"> = { website: "https://example.test" };`,
  );
  lines.push(
    `const moduleOptions: p${names.indexOf("./lib/moduleCommon")}.ModuleOptions = { validateResult: true };`,
  );
  lines.push(
    "void [types, handler, options, profile, moduleOptions, " +
      names.map((_, index) => `p${index}`).join(", ") +
      "];",
  );
  writeFileSync(join(root, `consumer.${extension}`), lines.join("\n") + "\n");
}
console.log(
  JSON.stringify({
    runtime: process.versions.bun
      ? `Bun ${process.versions.bun}`
      : `Node ${process.versions.node}`,
    exports: names.length,
    formats: ["ESM", "CommonJS"],
    fetchCalls,
    version: pkg.version,
  }),
);
