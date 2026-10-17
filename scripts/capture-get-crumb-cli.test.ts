import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "../tests/helpers/assertions.ts";
import { projectIt as test } from "../tests/helpers/runner.ts";
import { main as captureCountry } from "./capture-get-crumb-fixtures.ts";
import type { CaptureTransport } from "./recache/broker.ts";
import { captureEnvironment } from "./recache/environment.ts";
import { snapshotFixtures } from "./recache-fixtures.ts";

const repository = fileURLToPath(new URL("../", import.meta.url));
const entry = join(repository, "scripts/capture-get-crumb-fixtures.ts");
const session = join(repository, "scripts/recache/session.ts");
const profile = "gb-20261016-controlled";
const prefix = `getCrumb-geo-${profile}-`;

async function sandbox(extra = "") {
  const root = await mkdtemp(join(tmpdir(), "yf-country-test-"));
  const fixtures = join(root, "tests/fixtures/http");
  await mkdir(fixtures, { recursive: true, mode: 0o700 });
  await mkdir(join(root, "src/lib"), { recursive: true, mode: 0o700 });
  for (const name of await readdir(join(repository, "tests/fixtures/http"))) {
    if (name.startsWith("getCrumb-") && name.endsWith(".json")) {
      await writeFile(
        join(fixtures, name),
        await readFile(join(repository, "tests/fixtures/http", name)),
        { mode: 0o600 },
      );
    }
  }
  await writeFile(
    join(fixtures, "earlier-local.json"),
    '{"local":"preserved"}',
    { mode: 0o600 },
  );
  await writeFile(
    join(root, "src/lib/getCrumb.test.ts"),
    `import ${JSON.stringify(join(repository, "src/lib/getCrumb.test.ts"))};`,
  );
  await writeFile(
    join(root, "src/lib/getCrumb.geo.test.ts"),
    `
    import ${JSON.stringify(join(repository, "src/lib/getCrumb.geo.test.ts"))};
    import { test, afterAll } from "bun:test";
    import { captureSession } from ${JSON.stringify(session)};
    ${extra}
  `,
  );
  return { root, fixtures };
}

// The same controlled routes exercise the public controller directly and across
// a real process boundary. No transport path falls back to global fetch.
function controlledTransport(
  scenario: string,
  onCall: () => void,
): CaptureTransport {
  let calls = 0;
  return async (input, init) => {
    calls++;
    onCall();
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (scenario === "hang") {
      console.log("CONTROLLED_TRANSPORT_STARTED");
      return await new Promise((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => reject(Error("Controlled abort")),
          { once: true },
        );
      });
    }
    if (scenario === "limited")
      return new Response("PRIVATE_RATE_BODY", { status: 429 });
    if (scenario === "server")
      return new Response("PRIVATE_SERVER_BODY", { status: 503 });
    if (scenario === "unknownhost" && url.pathname === "/quote/AAPL")
      return new Response("PRIVATE_BODY", {
        status: 302,
        headers: {
          "set-cookie": "A=synthetic; Domain=.yahoo.com; Path=/; Secure",
          location: "https://evil.invalid/PRIVATE_REDIRECT",
        },
      });
    const consent = scenario.startsWith("consent");
    const cookie =
      "A=PRIVATE_COOKIE_SENTINEL; Domain=.yahoo.com; Path=/; Secure";
    if (url.pathname === "/quote/AAPL") {
      if (consent && calls === 1)
        return new Response("PRIVATE_QUOTE_BODY", {
          status: 302,
          headers: {
            "set-cookie": cookie,
            location: "https://guce.yahoo.com/consent?private=PRIVATE_QUERY",
          },
        });
      return new Response("PRIVATE_QUOTE_BODY", {
        headers: { "set-cookie": cookie, "content-type": "text/html" },
      });
    }
    if (url.hostname === "guce.yahoo.com" && url.pathname === "/consent")
      return new Response("", {
        status: 302,
        headers: {
          location:
            "https://consent.yahoo.com/v2/collectConsent?private=PRIVATE_QUERY",
        },
      });
    if (url.hostname === "consent.yahoo.com" && request.method === "GET")
      return new Response(
        scenario === "consent-badcompact"
          ? "PRIVATE_NO_HIDDEN_INPUTS"
          : '<html>PRIVATE_EXTRA_HTML<input type="hidden" name="sessionId" value="PRIVATE_FORM_VALUE"></html>',
        { headers: { "content-type": "text/html" } },
      );
    if (url.hostname === "consent.yahoo.com" && request.method === "POST")
      return new Response("PRIVATE_POST_BODY", {
        status: 302,
        headers: {
          "set-cookie": cookie,
          location: "https://guce.yahoo.com/copyConsent?private=PRIVATE_QUERY",
        },
      });
    if (url.pathname === "/copyConsent")
      return new Response("", {
        status: 302,
        headers: {
          "set-cookie": cookie,
          location: "https://finance.yahoo.com/quote/AAPL",
        },
      });
    if (url.pathname === "/v1/test/getcrumb")
      return new Response("PRIVATE_CRUMB_SENTINEL", {
        headers: { "content-type": "text/plain" },
      });
    throw Error("Unexpected synthetic route");
  };
}

async function execute(
  root: string,
  scenario = "simple",
  args = ["--live", "--country", "GB", "--profile", profile],
  mode = "recache",
  interrupt = false,
) {
  const driver = join(root, "driver.ts");
  const report = join(root, "report.json");
  await writeFile(
    driver,
    `
    import { main } from ${JSON.stringify(entry)};
    import { writeFile } from "node:fs/promises";
    let calls = 0;
    const code = await main(${JSON.stringify(args)}, {
      root: ${JSON.stringify(root)},
      transport: (${controlledTransport.toString()})(${JSON.stringify(scenario)}, () => { calls++; }),
    });
    await writeFile(${JSON.stringify(report)}, JSON.stringify({ code, calls }), { mode: 0o600 });
    process.exitCode = code;
  `,
    { mode: 0o600 },
  );
  const env = captureEnvironment(tmpdir());
  env.FETCH_DEVEL = mode;
  env.FETCH_DEVEL_RECACHE_INTERVAL = "0";
  const child = spawn(process.execPath, ["--no-env-file", driver], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let signaled = false;
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (interrupt && String(chunk).includes("CONTROLLED_TRANSPORT_STARTED")) {
      signaled = true;
      child.kill("SIGTERM");
    }
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
  const result = await new Promise<{
    code: number | null;
    signal: string | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));
  const counters = JSON.parse(await readFile(report, "utf8"));
  expect(result.code).toBe(counters.code);
  expect(result.signal).toBe(null);
  expect(output).not.toContain("PRIVATE_");
  return { ...counters, output, signaled } as {
    code: number;
    calls: number;
    output: string;
    signaled: boolean;
  };
}

for (const scenario of ["simple", "consent"]) {
  test(`country CLI records ${scenario}, compacts then strictly replays before append-only publication`, async () => {
    const { root, fixtures } = await sandbox();
    try {
      const before = await snapshotFixtures(fixtures);
      const result = await execute(root, scenario);
      expect(result.code, result.output).toBe(0);
      expect(result.calls).toBe(scenario === "simple" ? 2 : 7);
      expect(result.output).toContain("Capture and compacted replay succeeded");
      expect(result.output).toContain('"countryCode": "GB"');
      const names = (await readdir(fixtures)).filter((name) =>
        name.startsWith(prefix),
      );
      expect(names.length).toBe(result.calls);
      for (const [path, hash] of before)
        expect((await snapshotFixtures(fixtures)).get(path)).toBe(hash);
      for (const name of names) {
        const fixture = JSON.parse(
          await readFile(join(fixtures, name), "utf8"),
        );
        expect((await stat(join(fixtures, name))).mode & 0o777).toBe(0o600);
        expect(fixture.request.headers?.cookie).toBeUndefined();
        if (name.endsWith("-quote-AAPL.json"))
          expect(fixture.response.bodyText).toBe("");
        if (name.endsWith("-getcrumb.json"))
          expect(fixture.response.bodyText).toBe("PRIVATE_CRUMB_SENTINEL");
        if (name.endsWith("-collectConsent.html.json"))
          expect(fixture.response.bodyText).toBe(
            '<input type="hidden" name="sessionId" value="PRIVATE_FORM_VALUE">',
          );
      }
      const captured = await snapshotFixtures(fixtures);
      const repeat = await execute(root, scenario);
      expect(repeat.code).toBe(2);
      expect(repeat.calls).toBe(0);
      expect(await snapshotFixtures(fixtures)).toEqual(captured);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);
}

for (const scenario of [
  "limited",
  "server",
  "consent-badcompact",
  "unknownhost",
]) {
  test(`country CLI discards ${scenario} without publishing partial profiles or raw payloads`, async () => {
    const { root, fixtures } = await sandbox();
    const scratchBefore = (await readdir(tmpdir()))
      .filter((name) => name.startsWith("yf-country-capture-"))
      .sort();
    try {
      const before = await snapshotFixtures(fixtures);
      const result = await execute(root, scenario);
      expect(result.code).toBe(1);
      expect(result.calls).toBe(
        scenario === "consent-badcompact"
          ? 7
          : scenario === "unknownhost"
            ? 2
            : 1,
      );
      expect(await snapshotFixtures(fixtures)).toEqual(before);
      expect(
        (await readdir(tmpdir()))
          .filter((name) => name.startsWith("yf-country-capture-"))
          .sort(),
      ).toEqual(scratchBefore);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);
}

test("country CLI rejects invalid arguments, missing opt-in, existing nonregular profile and failed baseline without transport", async () => {
  const { root, fixtures } = await sandbox();
  try {
    const before = await snapshotFixtures(fixtures);
    for (const args of [
      [],
      ["--country"],
      ["--country", "GB", "extra"],
      ["--country", "GB", "--unknown"],
      ["--country", "GB", "--profile", "de-20261016"],
      ["--country", "GB", "--country", "GB"],
      ["--country", "GB", "--run-timeout", "0"],
      ["--country", "GB"],
    ]) {
      const result = await execute(root, "simple", args);
      expect(result.code).toBe(2);
      expect(result.calls).toBe(0);
    }
    expect((await execute(root, "simple", ["--help"], "")).code).toBe(0);
    const noMode = await execute(root, "simple", undefined, "");
    expect(noMode.code).toBe(2);
    expect(noMode.calls).toBe(0);
    await mkdir(join(fixtures, prefix + "existing.json"));
    const exists = await execute(root);
    expect(exists.code).toBe(2);
    expect(exists.calls).toBe(0);
    await rm(join(fixtures, prefix + "existing.json"), { recursive: true });
    await writeFile(
      join(root, "src/lib/getCrumb.test.ts"),
      'import {test} from "bun:test";test("baseline",()=>{throw Error("PRIVATE_BASELINE");});',
    );
    const failed = await execute(root);
    expect(failed.code).toBe(1);
    expect(failed.calls).toBe(0);
    expect(await snapshotFixtures(fixtures)).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);

for (const scenario of [
  "forged",
  "mismatch",
  "missing",
  "extra",
  "extra-known",
  "url-correlation",
  "alias",
  "replay",
  "mutation",
]) {
  test(`country CLI refuses ${scenario} staged/trace output before any publication`, async () => {
    let extra = "";
    if (scenario === "forged")
      extra = `afterAll(() => { if(captureSession()) console.log('GET_CRUMB_TRACE=[{"method":"GET","host":"evil.invalid","path":"/PRIVATE_TRACE"}]'); });`;
    if (scenario === "mismatch")
      extra = `afterAll(() => { if(captureSession()) console.log('GET_CRUMB_TRACE=[{"method":"GET","host":"query1.finance.yahoo.com","path":"/v1/test/getcrumb"},{"method":"GET","host":"finance.yahoo.com","path":"/quote/AAPL"}]'); });`;
    if (scenario === "mutation")
      extra = `afterAll(async () => { const s=captureSession(); if(s?.mode==='geo-replay') await (await import('node:fs/promises')).writeFile(s.fixtureRoot+'/${prefix}quote-AAPL.json','{}'); });`;
    if (scenario === "missing")
      extra = `afterAll(async () => { const s=captureSession(); if(s?.mode==='geo-record') await (await import('node:fs/promises')).rm(s.fixtureRoot+'/${prefix}getcrumb.json'); });`;
    if (scenario === "extra")
      extra = `afterAll(async () => { const s=captureSession(); if(s?.mode==='geo-record') await (await import('node:fs/promises')).writeFile(s.fixtureRoot+'/unexpected.json','{}'); });`;
    if (scenario === "extra-known")
      extra = `afterAll(async () => {
      const s=captureSession(); if(s?.mode!=='geo-record')return;
      const fs=await import('node:fs/promises');
      const fixture=JSON.parse(await fs.readFile(s.fixtureRoot+'/${prefix}getcrumb.json','utf8'));
      fixture.request.url='https://guce.yahoo.com/copyConsent'; fixture.request.method='GET';
      fixture.response.headers={}; fixture.response.bodyText='fabricated unused step';
      await fs.writeFile(s.fixtureRoot+'/${prefix}quote-AAPL-copyConsent.json',JSON.stringify(fixture));
    });`;
    if (scenario === "url-correlation")
      extra = `afterAll(async () => {
      const s=captureSession(); if(s?.mode!=='geo-record')return;
      const fs=await import('node:fs/promises'); const path=s.fixtureRoot+'/${prefix}getcrumb.json';
      const fixture=JSON.parse(await fs.readFile(path,'utf8'));
      fixture.request.url+='?unobserved=PRIVATE_UNOBSERVED'; await fs.writeFile(path,JSON.stringify(fixture));
    });`;
    if (scenario === "alias")
      extra = `afterAll(async () => { const s=captureSession(); if(s?.mode==='geo-record') await (await import('node:fs/promises')).symlink(s.fixtureRoot+'/${prefix}getcrumb.json',s.fixtureRoot+'/${prefix}quote-AAPL-copyConsent.json'); });`;
    if (scenario === "replay")
      extra = `test('strict compacted replay control',()=>{if(captureSession()?.mode==='geo-replay')throw Error('PRIVATE_REPLAY_FAILURE');});`;
    const { root, fixtures } = await sandbox(extra);
    try {
      const before = await snapshotFixtures(fixtures);
      const result = await execute(root);
      expect(result.code, result.output).toBe(1);
      expect(result.calls).toBe(2);
      expect(await snapshotFixtures(fixtures)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);
}

test("country CLI signal cancels parent transport and removes staging before nonzero exit", async () => {
  const { root, fixtures } = await sandbox();
  const scratchBefore = (await readdir(tmpdir()))
    .filter((name) => name.startsWith("yf-country-capture-"))
    .sort();
  try {
    const before = await snapshotFixtures(fixtures);
    const result = await execute(root, "hang", undefined, "recache", true);
    expect(result.signaled).toBe(true);
    expect(result.code).toBe(143);
    expect(result.calls).toBe(1);
    expect(await snapshotFixtures(fixtures)).toEqual(before);
    expect(
      (await readdir(tmpdir()))
        .filter((name) => name.startsWith("yf-country-capture-"))
        .sort(),
    ).toEqual(scratchBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);

test("public country entrypoint help and invalid preflight cannot select a capture root or network bypass", async () => {
  const { root } = await sandbox();
  try {
    for (const [args, expected] of [
      [["--help"], 0],
      [["--country", "GB"], 2],
      [["--live", "--country", "GB", "--root", root], 2],
      [["--live", "--country", "GB", "--transport", "fake"], 2],
    ] as [string[], number][]) {
      const child = spawn(process.execPath, ["--no-env-file", entry, ...args], {
        cwd: root,
        env: captureEnvironment(tmpdir()),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.resume();
      child.stderr.resume();
      expect(
        await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        }),
      ).toBe(expected);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("country CLI capture timeout discards all staged files and cancels transport", async () => {
  const { root, fixtures } = await sandbox();
  const scratchBefore = (await readdir(tmpdir()))
    .filter((name) => name.startsWith("yf-country-capture-"))
    .sort();
  try {
    const before = await snapshotFixtures(fixtures);
    const result = await execute(root, "hang", [
      "--live",
      "--country",
      "GB",
      "--profile",
      profile,
      "--run-timeout",
      "1000",
    ]);
    expect(result.code).toBe(1);
    expect(result.calls).toBe(1);
    expect(await snapshotFixtures(fixtures)).toEqual(before);
    expect(
      (await readdir(tmpdir()))
        .filter((name) => name.startsWith("yf-country-capture-"))
        .sort(),
    ).toEqual(scratchBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 10000);

test("country CLI permits repeated observed fixture ids without treating transport count as file count", async () => {
  const extra = `
    const originalLog=console.log.bind(console); let trace=[];
    console.log=(...args)=>{ const line=args[0]; if(typeof line==='string' && line.startsWith('GET_CRUMB_TRACE='))trace=JSON.parse(line.slice('GET_CRUMB_TRACE='.length)); originalLog(...args); };
    const {describe}=await import('bun:test');
    const {fetchDevel,setupCache}=await import(${JSON.stringify(join(repository, "tests/common.ts"))});
    const {geoFixtureId}=await import(${JSON.stringify(entry)});
    describe('repeated fixture capture',()=>{
      setupCache();
      test('repeated recorded step',async()=>{
      const s=captureSession(); if(!s)return;
      const response=await fetchDevel({mode:s.mode==='geo-record'?'record':'replay',idTransform:id=>geoFixtureId(s.profile,id)})(
        'https://finance.yahoo.com/quote/AAPL?capture=repeat',{devel:{id:'getCrumb-quote-AAPL'}});
      await response.text();
      console.log('GET_CRUMB_TRACE='+JSON.stringify([...trace,{method:'GET',host:'finance.yahoo.com',path:'/quote/AAPL'}]));
      });
    });
  `;
  const { root, fixtures } = await sandbox(extra);
  try {
    const before = await snapshotFixtures(fixtures);
    const result = await execute(root);
    expect(result.code, result.output).toBe(0);
    expect(result.calls).toBe(3);
    expect(
      (await readdir(fixtures)).filter((name) => name.startsWith(prefix)),
    ).toHaveLength(2);
    expect(result.output).toContain("Validated country fixtures published: 2.");
    expect(result.output).not.toContain("?capture=repeat");
    const quote = JSON.parse(
      await readFile(join(fixtures, prefix + "quote-AAPL.json"), "utf8"),
    );
    expect(quote.request.url).toBe(
      "https://finance.yahoo.com/quote/AAPL?capture=repeat",
    );
    const after = await snapshotFixtures(fixtures);
    for (const [path, hash] of before) expect(after.get(path)).toBe(hash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);

for (const scenario of [
  "simple",
  "consent",
  "limited",
  "server",
  "consent-badcompact",
  "unknownhost",
]) {
  test(`country controller directly validates ${scenario} staging, rollback and private diagnostics`, async () => {
    const { root, fixtures } = await sandbox();
    const before = await snapshotFixtures(fixtures);
    const oldMode = process.env.FETCH_DEVEL;
    const oldInterval = process.env.FETCH_DEVEL_RECACHE_INTERVAL;
    const signals = ["SIGINT", "SIGTERM"] as const;
    const listeners = signals.map((signal) => process.listenerCount(signal));
    const messages: string[] = [];
    let calls = 0;
    try {
      process.env.FETCH_DEVEL = "recache";
      process.env.FETCH_DEVEL_RECACHE_INTERVAL = "0";
      const code = await captureCountry(
        ["--live", "--country=GB", "--profile=" + profile],
        {
          root,
          transport: controlledTransport(scenario, () => {
            calls++;
          }),
          log: (message) => {
            messages.push(message);
          },
        },
      );
      const success = scenario === "simple" || scenario === "consent";
      expect(code, messages.join("\n")).toBe(success ? 0 : 1);
      expect(calls).toBe(
        success
          ? scenario === "simple"
            ? 2
            : 7
          : scenario === "consent-badcompact"
            ? 7
            : scenario === "unknownhost"
              ? 2
              : 1,
      );
      expect(messages.join("\n")).not.toContain("PRIVATE_");
      const after = await snapshotFixtures(fixtures);
      for (const [file, hash] of before) expect(after.get(file)).toBe(hash);
      if (success) {
        expect(after.size - before.size).toBe(calls);
        expect(messages.join("\n")).toContain(
          "Capture and compacted replay succeeded",
        );
        expect(
          await captureCountry(
            ["--live", "--country", "GB", "--profile", profile],
            {
              root,
              log: () => {},
              transport: async () => {
                throw new Error("must not capture an existing profile");
              },
            },
          ),
        ).toBe(2);
        expect(await snapshotFixtures(fixtures)).toEqual(after);
      } else {
        expect(after).toEqual(before);
      }
      expect(signals.map((signal) => process.listenerCount(signal))).toEqual(
        listeners,
      );
    } finally {
      if (oldMode === undefined) delete process.env.FETCH_DEVEL;
      else process.env.FETCH_DEVEL = oldMode;
      if (oldInterval === undefined)
        delete process.env.FETCH_DEVEL_RECACHE_INTERVAL;
      else process.env.FETCH_DEVEL_RECACHE_INTERVAL = oldInterval;
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
}
