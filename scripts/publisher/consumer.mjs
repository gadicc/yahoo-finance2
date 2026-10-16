/** Generate real minimum-Deno consumer checks; execution is publisher-owned. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";

/** @param {Record<string,string>} exports @param {string} root @param {'source'|'npm'} kind @param {string} version @param {string} [denoVersion] */
export function consumerSource(
  exports,
  root,
  kind,
  version,
  denoVersion = "2.0.0",
) {
  const names = Object.keys(exports);
  const index = (/** @type {string} */ name) => {
    const position = names.indexOf(name);
    assert(position >= 0, `Missing required consumer export: ${name}`);
    return `p${position}`;
  };
  const specifier = (/** @type {string} */ name) =>
    kind === "source"
      ? pathToFileURL(join(root, exports[name])).href
      : name === "."
        ? "yahoo-finance2"
        : `yahoo-finance2/${name.slice(2)}`;
  const imports = names
    .map(
      (name, i) => `import * as p${i} from ${JSON.stringify(specifier(name))};`,
    )
    .join("\n");
  return `${imports}
import assert from "node:assert/strict";
globalThis.fetch = () => Promise.reject(new Error("Publisher consumer ordinary fetch forbidden"));
const aliases = [${names.map((_, i) => `p${i}`).join(",")}];
assert.equal(aliases.length,${names.length});
assert.equal(${index("./src/index.ts")}.default,${index(".")}.default);
assert.equal(${index("./modules/quoteSummary-iface")}.Grade.StrongBuy,"Strong Buy");
const YahooFinance=${index(".")}.default;
const cookieJar=new ${index("./lib/cookieJar")}.ExtendedCookieJar();
await cookieJar.setCookie("crumb=publisher-crumb; Path=/","http://config.yf2/");
await cookieJar.setCookie("A1=publisher-cookie; Domain=.yahoo.com; Path=/","https://finance.yahoo.com/");
let fetches=0;
const quote={symbol:"PUBLISHER",language:"en-US",region:"US",quoteType:"EQUITY",triggerable:false,marketState:"REGULAR",tradeable:true,exchange:"NMS",exchangeTimezoneName:"America/New_York",exchangeTimezoneShortName:"EDT",gmtOffSetMilliseconds:-14400000,market:"us_market",esgPopulated:false,sourceInterval:15,exchangeDataDelayedBy:0,fullExchangeName:"NasdaqGS",regularMarketPrice:123.45,regularMarketTime:1700000000};
const client=new YahooFinance({cookieJar,versionCheck:false,suppressNotices:["yahooSurvey"],fetch:async(input,init)=>{
  fetches++;const url=new URL(String(input));assert.equal(url.hostname,"query2.finance.yahoo.com");assert.equal(url.pathname,"/v7/finance/quote");assert.equal(url.searchParams.get("symbols"),"PUBLISHER");assert.equal(url.searchParams.get("crumb"),"publisher-crumb");assert(JSON.stringify(init)?.includes(${JSON.stringify(version)}));return Response.json({quoteResponse:{result:[quote],error:null}});
}});
const result=await client.quote("PUBLISHER");
const typedSymbol:string=result.symbol;
assert.equal(typedSymbol,"PUBLISHER");assert.equal(result.regularMarketPrice,123.45);assert(result.regularMarketTime instanceof Date);assert.equal(result.regularMarketTime.toISOString(),"2023-11-14T22:13:20.000Z");
assert.equal(fetches,1);
const server=${index("./mcp/server")}.createYahooFinanceMcpServer({client:{quote:async()=>result},enabledTools:["quote"]});await server.close();
const handler=${index("./mcp/http")}.createYahooFinanceMcpWebHandler({client:{},enabledTools:[]});assert.equal((await handler(new Request("http://localhost/missing"))).status,404);
assert.equal(Deno.version.deno,${JSON.stringify(denoVersion)});
console.log(JSON.stringify({kind:${JSON.stringify(kind)},exports:aliases.length,deno:Deno.version.deno,version:${JSON.stringify(version)},fetches,dates:true,validation:true,cookies:true,mcp:true}));
`;
}

const invalidSdkCall = "server.registerTool(123, {}, () => ({ content: [] }));";

/** The negative shares every import and consumer statement with its passing positive.
 * It is checked, never executed. @param {string} positive */
export function sdkNegativeSource(positive) {
  return `${positive}\n${invalidSdkCall}\n`;
}

/** Refuse a false green or unrelated failure; require the real invalid SDK call.
 * @param {{status:number|null,signal?:string|null,error?:string,stdout:string,stderr:string}} observation
 * @param {string} file @param {string} source */
export function assertSdkTypeRejection(observation, file, source) {
  assert.equal(
    observation.status,
    1,
    "Invalid SDK argument must fail typechecking",
  );
  assert(
    !observation.signal && !observation.error,
    "SDK negative must complete normally",
  );
  const text = stripVTControlCharacters(
    `${observation.stdout}\n${observation.stderr}`,
  );
  assert.deepEqual(
    text.match(/\bTS\d+\b/g),
    ["TS2345"],
    "Expected only the intended SDK type diagnostic",
  );
  assert(
    text.includes(
      "Argument of type 'number' is not assignable to parameter of type 'string'.",
    ),
    "Expected numeric tool-name diagnostic",
  );
  assert(
    text.split(/\r?\n/).some((line) => line === invalidSdkCall),
    "Missing intended invalid SDK call",
  );
  const lines = source.split(/\r?\n/);
  const index = lines.indexOf(invalidSdkCall);
  assert(
    index >= 0 && lines.lastIndexOf(invalidSdkCall) === index,
    "SDK negative source must contain one intended call",
  );
  const column = invalidSdkCall.indexOf("123") + 1;
  const locations = [...text.matchAll(/^\s*at (.+):(\d+):(\d+)\s*$/gm)];
  assert(
    locations.some((match) => {
      try {
        const path = match[1].startsWith("file:")
          ? fileURLToPath(match[1])
          : resolve(match[1]);
        return (
          resolve(path) === resolve(file) &&
          Number(match[2]) === index + 1 &&
          Number(match[3]) === column
        );
      } catch {
        return false;
      }
    }),
    "SDK diagnostic must identify the exact negative file/call location",
  );
  return { code: "TS2345", file: resolve(file), line: index + 1, column };
}
