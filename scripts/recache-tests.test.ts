import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { expect } from "../tests/migration/assertions.ts";
import { projectIt as test } from "../tests/migration/runner.ts";
import { parseRecacheArguments, runRecache } from "./recache-tests.ts";
import { captureEnvironment } from "./recache/environment.ts";
import type { CaptureTransport } from "./recache/broker.ts";

const helper = fileURLToPath(
  new URL("../tests/recacheFetch.ts", import.meta.url),
);
const stats = fileURLToPath(
  new URL("../tests/recacheStats.ts", import.meta.url),
);
const common = fileURLToPath(new URL("../tests/common.ts", import.meta.url));
const repository = fileURLToPath(new URL("../", import.meta.url));

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), "yf-recache-runner-"));
  await mkdir(join(root, "src"), { mode: 0o700 });
  await mkdir(join(root, "tests", "fixtures", "http"), {
    recursive: true,
    mode: 0o700,
  });
  return root;
}

async function copyActualFixtures(root: string) {
  const destination = join(root, "tests", "fixtures", "http");
  for (const name of await readdir(
    join(repository, "tests", "fixtures", "http"),
  )) {
    if (name.endsWith(".json")) {
      await writeFile(
        join(destination, name),
        await readFile(join(repository, "tests", "fixtures", "http", name)),
        { mode: 0o600 },
      );
    }
  }
}

const source = (rateLimited: boolean, drift: boolean) => `
  import { test } from "bun:test";
  import { createRecacheFetch } from ${JSON.stringify(helper)};
  import { RECACHE_STATS_PREFIX } from ${JSON.stringify(stats)};
  test("synthetic capture", async () => {
    if (process.env.FMC_CACHE_MODE === "replay") {
      if (process.env.FETCH_DEVEL) throw Error("baseline inherited recache");
      return;
    }
    const emit = () => console.log(RECACHE_STATS_PREFIX + JSON.stringify(fetch.getStats()));
    const fetch = createRecacheFetch(globalThis.fetch, 0, undefined, (error) => { emit(); console.error(error.message); });
    const url = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL";
    await (await fetch(url)).text(); emit();
    await (await fetch(url)).text(); emit();
    if (${rateLimited}) {
      await fetch(url + "&fields=symbol").catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    if (${drift}) throw Error("schema drift");
  });
`;

for (const scenario of ["success", "drift", "limited"]) {
  test(`recache runner aggregates final snapshots and handles ${scenario}`, async () => {
    const root = await sandbox();
    try {
      await writeFile(
        join(root, "src", "first.test.ts"),
        source(scenario === "limited", scenario === "drift"),
      );
      await writeFile(
        join(root, "src", "second.test.ts"),
        source(false, false),
      );
      const logs: string[] = [];
      const started = performance.now();
      let calls = 0;
      const code = await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        log: (line) => logs.push(line),
        transport: async () =>
          new Response("data", {
            status: ++calls === 2 && scenario === "limited" ? 429 : 200,
          }),
      });
      const output = logs.join("\n");
      expect(code).toBe(scenario === "success" ? 0 : 1);
      expect(output).toContain("Replay-only baseline passed");
      expect(output.includes("Recaching file 2/2")).toBe(
        scenario !== "limited",
      );
      if (scenario === "limited") {
        expect(performance.now() - started).toBeLessThan(8000);
        expect(output).toContain(
          "Total: 2 network attempts; 1 requests reused.",
        );
        expect(output).toContain("200: 1, 429: 1");
        expect(output).toContain("Recache ABORTED: HTTP 429");
        expect(output).toContain("Fixture changes since this run started: 0.");
        expect(output).toContain("no rollback, staging, commit, or push");
      } else
        expect(output).toContain(
          "Total: 2 network attempts; 2 requests reused.",
        );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("replay baseline failure and missing-cache failure prevent any capture transport", async () => {
  const root = await sandbox();
  let attempts = 0;
  const transport = async () => {
    attempts++;
    return new Response("Unexpected live response");
  };
  try {
    const file = join(root, "src", "baseline.test.ts");
    const logs: string[] = [];
    await writeFile(
      file,
      `import { test } from "bun:test"; test("failed baseline", () => { throw Error("existing cached failure"); });`,
    );
    expect(
      await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        transport,
        log: (line) => logs.push(line),
      }),
    ).toBe(1);
    expect(logs.join("\n")).toContain("replay-only baseline failed");
    const cache = fileURLToPath(
      new URL("../tests/fetchCache.ts", import.meta.url),
    );
    await writeFile(
      file,
      `
      import { test } from "bun:test";
      import cache from ${JSON.stringify(cache)};
      test("native missing fixture fails without network fallback", async () => {
        if (process.env.FMC_CACHE_MODE !== "replay") return;
        cache.once({ id: "replay-required-missing-" + crypto.randomUUID() });
        try {
          await cache("https://query2.finance.yahoo.com/v7/finance/quote", {});
          throw Error("Unexpected live response");
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("cache miss in replay mode")) throw error;
        }
      });
    `,
    );
    expect(
      await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        transport,
        log() {},
      }),
    ).toBe(0);
    await writeFile(
      file,
      `
      import { test } from "bun:test";
      import cache from ${JSON.stringify(cache)};
      test("unhandled missing baseline fixture", async () => {
        cache.once({ id: "replay-required-missing-" + crypto.randomUUID() });
        await cache("https://query2.finance.yahoo.com/v7/finance/quote", {});
      });
    `,
    );
    expect(
      await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        transport,
        log() {},
      }),
    ).toBe(1);
    expect(attempts).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("caught broker rate limits abort later files and preserve earlier validated captures without raw output", async () => {
  const root = await sandbox();
  const logs: string[] = [];
  let attempts = 0;
  try {
    await writeFile(
      join(root, "src", "first.test.ts"),
      `
      import { it, setupCache, fetchDevel, expect } from ${JSON.stringify(common)};
      setupCache();
      it("captured shape drift", async (_t, onFinish) => {
        if (process.env.FMC_CACHE_MODE === "replay") return;
        const response = await fetchDevel()("https://query2.finance.yahoo.com/v7/finance/quote", { devel: { id: "earlier", onFinish } });
        expect(await response.json()).toEqual({ old: true });
      });
    `,
    );
    await writeFile(
      join(root, "src", "second.test.ts"),
      `
      import { it, setupCache, fetchCache } from ${JSON.stringify(common)};
      setupCache();
      it("caught limited request", async () => {
        if (process.env.FMC_CACHE_MODE === "replay") return;
        globalThis.console = { ...console, log() {}, error() {} };
        fetchCache.once({ id: "limited", mode: "record", writeCache: false });
        await fetchCache("https://query1.finance.yahoo.com/v1/test/getcrumb", {}).catch(() => {});
        console.warn("PRIVATE_SESSION_CRUMB_SENTINEL");
      });
    `,
    );
    await writeFile(join(root, "src", "third.test.ts"), source(false, false));
    expect(
      await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        log: (line) => logs.push(line),
        transport: async () => {
          attempts++;
          return attempts === 1
            ? Response.json({ new: true })
            : new Response("PRIVATE_BODY", { status: 429 });
        },
      }),
    ).toBe(1);
    expect(attempts).toBe(2);
    expect(logs.join("\n")).not.toContain("Recaching file 3/3");
    expect(logs.join("\n")).not.toContain("PRIVATE_");
    expect(logs.join("\n")).toContain("429: 1");
    expect(
      JSON.parse(
        await readFile(
          join(root, "tests", "fixtures", "http", "earlier.json"),
          "utf8",
        ),
      ).response.bodyJson,
    ).toEqual({ new: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generic auth behavior stays replay-only during an explicitly requested capture", async () => {
  const root = await sandbox();
  let attempts = 0;
  const logs: string[] = [];
  try {
    await copyActualFixtures(root);
    await writeFile(
      join(root, "src", "auth.test.ts"),
      `import ${JSON.stringify(join(repository, "src/lib/getCrumb.test.ts"))};`,
    );
    const code = await runRecache(parseRecacheArguments(["--live"], "0"), {
      root,
      log: (line) => logs.push(line),
      transport: async () => {
        attempts++;
        throw Error("Unexpected live auth request");
      },
    });
    expect(code).toBe(0);
    expect(attempts).toBe(0);
    expect(logs.join("\n")).toContain("No live network requests were made.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);

test("public recache CLI rejects missing opt-in and invalid options before any baseline", () => {
  const command = fileURLToPath(new URL("./recache-tests.ts", import.meta.url));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [command, ...args], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, FETCH_DEVEL: "recache" },
    });
  expect(run("--help").status).toBe(0);
  const alias = spawnSync(process.execPath, ["run", "test:recache", "--help"], {
    cwd: repository,
    encoding: "utf8",
    timeout: 5000,
    env: captureEnvironment(tmpdir()),
  });
  expect(alias.status).toBe(0);
  expect(alias.stdout).toContain(
    "Usage: FETCH_DEVEL=recache bun scripts/recache-tests.ts",
  );
  expect(run().status).toBe(2);
  expect(run("--unknown").status).not.toBe(0);
  const noEnvironment = spawnSync(process.execPath, [command, "--live"], {
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, FETCH_DEVEL: "" },
  });
  expect(noEnvironment.status).toBe(2);
  for (const invalid of ["NaN", "-1", "Infinity", "2147483648"]) {
    expect(() => parseRecacheArguments(["--live"], invalid)).toThrow();
  }
});

test("actual quoteCombine fake clocks and Yahoo fetch queue use paced synthetic transport in copied fixtures", async () => {
  const root = await sandbox();
  try {
    await copyActualFixtures(root);
    for (const [name, original] of [
      ["fetch", "src/lib/yahooFinanceFetch.test.ts"],
      ["combine", "src/other/quoteCombine.test.ts"],
    ]) {
      await writeFile(
        join(root, "src", name + ".test.ts"),
        `import ${JSON.stringify(join(repository, original))};`,
      );
    }
    const transport: CaptureTransport = async (_input, _init, id) => {
      if (typeof id !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(id)) {
        throw Error("Synthetic recache requires a fixture id");
      }
      const fixture = JSON.parse(
        await readFile(
          join(
            root,
            "tests",
            "fixtures",
            "http",
            id.replace(/\.json$/, "") + ".json",
          ),
          "utf8",
        ),
      );
      const response = fixture.response;
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers ?? {})) {
        for (const item of Array.isArray(value) ? value : [value])
          headers.append(key, String(item));
      }
      const body =
        response.bodyJson !== undefined
          ? JSON.stringify(response.bodyJson)
          : response.bodyText;
      if (body === undefined) throw Error("Unsupported synthetic fixture body");
      return new Response(body, { status: response.status, headers });
    };
    const logs: string[] = [];
    const code = await runRecache(parseRecacheArguments(["--live"], "20"), {
      root,
      transport,
      log: (line) => logs.push(line),
    });
    expect(code, logs.join("\n")).toBe(0);
    expect(logs.join("\n")).toContain("network attempts;");
    expect(logs.join("\n")).not.toContain(
      "No live network requests were made.",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);

test("recache spaces actual transport starts across native child boundaries", async () => {
  const root = await sandbox();
  const starts: number[] = [];
  try {
    const source = `
      import { it, setupCache, fetchDevel, expect } from ${JSON.stringify(common)};
      setupCache();
      it("live data", async (_t, onFinish) => {
        if (process.env.FMC_CACHE_MODE === "replay") return;
        const response = await fetchDevel()("https://query2.finance.yahoo.com/v7/finance/quote", { devel: { id: "passing", onFinish } });
        expect(await response.json()).toEqual({ data: 42 });
      });
    `;
    await writeFile(join(root, "src", "one.test.ts"), source);
    await writeFile(join(root, "src", "two.test.ts"), source);
    expect(
      await runRecache(parseRecacheArguments(["--live"], "200"), {
        root,
        log() {},
        transport: async () => {
          starts.push(Date.now());
          return Response.json({ data: 42 });
        },
      }),
    ).toBe(0);
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("capture abort cleans private staging and stops a live child without waiting for its body", async () => {
  const root = await sandbox();
  const before = (await readdir(tmpdir()))
    .filter((name) => name.startsWith("yf-recache-"))
    .sort();
  const abort = new AbortController();
  try {
    await writeFile(
      join(root, "src", "hung.test.ts"),
      `
      import { test } from "bun:test";
      test("capture abort", async () => {
        if (process.env.FMC_CACHE_MODE === "replay") return;
        await fetch("https://finance.yahoo.com/quote/AAPL");
        await new Promise(resolve => setTimeout(resolve, 10000));
      });
    `,
    );
    expect(
      await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        signal: abort.signal,
        log() {},
        transport: async () => {
          setTimeout(() => abort.abort(), 30);
          return new Response("not captured");
        },
      }),
    ).toBe(1);
    expect(
      (await readdir(tmpdir()))
        .filter((name) => name.startsWith("yf-recache-"))
        .sort(),
    ).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("actual recache entrypoint handles SIGTERM with nonzero exit and private-stage cleanup", async () => {
  const root = await sandbox();
  const before = (await readdir(tmpdir()))
    .filter((name) => name.startsWith("yf-recache-"))
    .sort();
  const entry = fileURLToPath(new URL("./recache-tests.ts", import.meta.url));
  try {
    await writeFile(
      join(root, "src", "hung.test.ts"),
      `
      import { test } from "bun:test";
      test("capture termination", async () => {
        if (process.env.FMC_CACHE_MODE === "replay") return;
        await fetch("https://finance.yahoo.com/quote/AAPL");
        await new Promise(resolve => setTimeout(resolve, 10000));
      });
    `,
    );
    const driver = join(root, "driver.ts");
    await writeFile(
      driver,
      `
      import { main } from ${JSON.stringify(entry)};
      process.exitCode = await main(["--live"], {
        root: ${JSON.stringify(root)},
        transport: async () => { console.log("CONTROLLED_CHILD_REQUEST"); return new Response("synthetic"); },
      });
    `,
    );
    const child = spawn(process.execPath, [driver], {
      env: {
        ...process.env,
        FETCH_DEVEL: "recache",
        FETCH_DEVEL_RECACHE_INTERVAL: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    let observedRequest = false;
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("CONTROLLED_CHILD_REQUEST")) {
        observedRequest = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.resume();
    const result = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    }).finally(() => clearTimeout(timer));
    expect(observedRequest).toBe(true);
    expect(result).toEqual({ code: 143, signal: null });
    expect(
      (await readdir(tmpdir()))
        .filter((name) => name.startsWith("yf-recache-"))
        .sort(),
    ).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("baseline, capture and grandchildren receive only the explicit nonsecret environment", async () => {
  const root = await sandbox();
  const forbidden = [
    "GITHUB_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "NODE_OPTIONS",
    "BUN_OPTIONS",
    "LD_PRELOAD",
    "PYTHONPATH",
    "PYTHONINSPECT",
    "FETCH_DEVEL_NOCACHE",
    "FMC_CAPTURE_SENTINEL",
    "BUN_JSC_forceGCSlowPaths",
  ];
  const saved = new Map(forbidden.map((key) => [key, process.env[key]]));
  try {
    const preload = join(root, "sentinel.ts");
    const marker = join(root, "PRELOAD_EXECUTED");
    await writeFile(
      preload,
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "sentinel");`,
    );
    // This executable negative control proves the sentinel is a functioning
    // preload before checking that no inherited loader option can activate it.
    const driver = join(root, "sentinel-driver.ts");
    await writeFile(driver, "export {};\n");
    expect(
      spawnSync(process.execPath, ["--preload=" + preload, driver], {
        env: { PATH: process.env.PATH },
      }).status,
    ).toBe(0);
    expect(await readFile(marker, "utf8")).toBe("sentinel");
    await rm(marker);
    await writeFile(
      join(root, ".env"),
      "GITHUB_TOKEN=PRIVATE_DOTENV_SENTINEL\n",
    );
    const dotenvDriver = join(root, "dotenv-driver.ts");
    await writeFile(
      dotenvDriver,
      'if (process.env.GITHUB_TOKEN !== "PRIVATE_DOTENV_SENTINEL") process.exit(9);',
    );
    expect(
      spawnSync(process.execPath, [dotenvDriver], {
        cwd: root,
        env: { PATH: process.env.PATH },
      }).status,
    ).toBe(0);
    for (const key of forbidden) process.env[key] = "PRIVATE_ENV_SENTINEL";
    process.env.NODE_OPTIONS = "--import=" + preload;
    process.env.BUN_OPTIONS = "--preload=" + preload;
    process.env.PYTHONPATH = root;
    await writeFile(
      join(root, "sitecustomize.py"),
      `open(${JSON.stringify(marker)}, "w").write("python preload")`,
    );
    await writeFile(
      join(root, "src", "environment.test.ts"),
      `
      import { test } from "bun:test";
      import { spawnSync } from "node:child_process";
      const forbidden = ${JSON.stringify(forbidden)};
      test("private environment", async () => {
        for (const key of forbidden) if (process.env[key] !== undefined) throw Error("Inherited forbidden environment");
        if (process.env.YF_CAPTURE_SESSION) throw Error("Preload token path leaked into tests");
        if (process.env.FMC_CACHE_MODE === "replay") {
          if (process.env.FETCH_DEVEL) throw Error("Replay inherited capture mode");
        } else {
          if (process.env.FETCH_DEVEL !== "recache" || process.env.FMC_CACHE_MODE !== "auto") throw Error("Capture mode missing");
          await fetch("https://query2.finance.yahoo.com/v7/finance/quote");
        }
        const child = spawnSync(process.execPath, ["--no-env-file", "-e", "const keys=" + JSON.stringify(forbidden) + "; for(const key of keys) if(process.env[key]) process.exit(7)"], { encoding: "utf8" });
        if (child.status !== 0) throw Error("Grandchild inherited forbidden environment");
      });
    `,
    );
    const logs: string[] = [];
    let attempts = 0;
    expect(
      await runRecache(parseRecacheArguments(["--live"], "0"), {
        root,
        log: (line) => logs.push(line),
        transport: async () => {
          attempts++;
          return Response.json({ data: true });
        },
      }),
    ).toBe(0);
    expect(attempts).toBe(1);
    expect(logs.join("\n")).not.toContain("PRIVATE_ENV_SENTINEL");
    await expect(readFile(marker)).rejects.toThrow();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("default3000ms pacing completes three distinct fetches within the configured native capture timeout", async () => {
  const root = await sandbox();
  try {
    await writeFile(
      join(root, "src", "paced.test.ts"),
      `import { test } from "bun:test";
      test("three paced requests", async () => {
        if (process.env.FMC_CACHE_MODE === "replay") return;
        for (const symbol of ["AAPL", "MSFT", "GOOGL"]) {
          const response = await fetch("https://query2.finance.yahoo.com/v7/finance/quote?symbols=" + symbol);
          if ((await response.json()).data !== 42) throw Error("Synthetic data missing");
        }
      });`,
    );
    for (const interval of [undefined, "0"]) {
      const starts: number[] = [];
      const options = parseRecacheArguments(
        ["--live", "--run-timeout", "12000"],
        interval,
      );
      expect(options.interval).toBe(interval === undefined ? 3000 : 0);
      expect(
        await runRecache(options, {
          root,
          log() {},
          transport: async () => {
            starts.push(performance.now());
            return Response.json({ data: 42 });
          },
        }),
      ).toBe(0);
      expect(starts).toHaveLength(3);
      for (let index = 1; index < starts.length; index++) {
        expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(
          options.interval,
        );
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
