import { expect } from "@std/expect";

const canRun =
  (await Deno.permissions.query({ name: "run", command: Deno.execPath() }))
    .state === "granted";
const canWrite =
  (await Deno.permissions.query({ name: "write", path: "/tmp" })).state ===
    "granted";

// Opt in with --allow-run=deno --allow-write=/tmp. Ordinary fixture tests keep
// their restricted permissions and do not recursively spawn another runner.
Deno.test({
  name:
    "recache runner aggregates final snapshots and stops after caught rate limits",
  ignore: !canRun || !canWrite,
  async fn() {
    const dir = await Deno.makeTempDir({
      dir: "/tmp",
      prefix: "yf-recache-runner-",
    });
    const helper = new URL("../tests/recacheFetch.ts", import.meta.url).href;
    const stats = new URL("../tests/recacheStats.ts", import.meta.url).href;
    const source = (rateLimited: boolean, drift: boolean) => `
      import { createRecacheFetch } from ${JSON.stringify(helper)};
      import { RECACHE_STATS_PREFIX } from ${JSON.stringify(stats)};
      Deno.test("synthetic capture", async () => {
        if (Deno.env.get("FMC_CACHE_MODE") === "replay") {
          if (Deno.env.get("FETCH_DEVEL") === "recache") throw new Error("baseline inherited recache");
          console.log("REPLAY_BASELINE_RAN");
          return;
        }
        let calls = 0;
        const emit = () => console.log(RECACHE_STATS_PREFIX + JSON.stringify(fetch.getStats()));
        const fetch = createRecacheFetch(() => Promise.resolve(new Response("data", {
          status: ++calls === 2 && ${rateLimited} ? 429 : 200,
        })), 0, undefined, (error) => { emit(); console.error(error.message); });
        const url = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL";
        await (await fetch(url)).text();
        emit();
        await (await fetch(url)).text();
        emit();
        if (${rateLimited}) {
          await fetch(url + "&fields=symbol").catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        if (${drift}) throw new Error("schema drift");
      });
    `;
    try {
      const first = dir + "/first.test.ts";
      const second = dir + "/second.test.ts";
      await Deno.writeTextFile(
        second,
        source(false, false) +
          '\nif (Deno.env.get("FETCH_DEVEL") === "recache") console.log("SECOND_FILE_RAN");',
      );
      for (const scenario of ["success", "drift", "limited"]) {
        await Deno.writeTextFile(
          first,
          source(scenario === "limited", scenario === "drift"),
        );
        const started = performance.now();
        const result = await new Deno.Command(Deno.execPath(), {
          args: ["task", "test:recache", first, second],
          env: {
            FETCH_DEVEL: "recache",
            FETCH_DEVEL_RECACHE_INTERVAL: "0",
            FMC_CACHE_MODE: "auto",
          },
          stdout: "piped",
          stderr: "piped",
        }).output();
        const output = new TextDecoder().decode(result.stdout) +
          new TextDecoder().decode(result.stderr);
        expect(result.code).toBe(scenario === "success" ? 0 : 1);
        expect(output).toContain("REPLAY_BASELINE_RAN");
        expect(output.includes("SECOND_FILE_RAN")).toBe(scenario !== "limited");
        if (scenario === "limited") {
          expect(performance.now() - started).toBeLessThan(8000);
          expect(output).toContain(
            "Total: 2 network attempts; 1 requests reused.",
          );
          expect(output).toContain("200: 1, 429: 1");
          expect(output).toContain(`Recache ABORTED: HTTP 429 in ${first}`);
          expect(output).toContain(
            "Fixture changes since this run started: 0.",
          );
          expect(output).toContain("no rollback, staging, commit, or push");
        } else {
          expect(output).toContain(
            "Total: 2 network attempts; 2 requests reused.",
          );
        }
      }

      // Exercise the native environment mode and the repository's real FS store,
      // not just a createFetchCache({ mode: "replay" }) unit-test instance.
      const cache = new URL("../tests/fetchCache.ts", import.meta.url).href;
      await Deno.writeTextFile(
        first,
        `
        import fetchCache from ${JSON.stringify(cache)};
        Deno.test("missing baseline fixture", async () => {
          fetchCache.once({ id: "replay-required-missing-" + crypto.randomUUID() });
          try {
            await fetchCache("https://query2.finance.yahoo.com/v7/finance/quote", {});
            throw new Error("Unexpected live response");
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("cache miss in replay mode")) throw error;
          }
        });
      `,
      );
      const baseline = await new Deno.Command(Deno.execPath(), {
        args: ["task", "test:replay", first],
        env: { FETCH_DEVEL: "" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      expect(baseline.code).toBe(0);

      await Deno.writeTextFile(
        first,
        `
        Deno.test("failed baseline", () => {
          if (Deno.env.get("FMC_CACHE_MODE") === "replay") throw new Error("existing cached failure");
          console.log("LIVE_REQUESTS_STARTED");
        });
      `,
      );
      const blocked = await new Deno.Command(Deno.execPath(), {
        args: ["task", "test:recache", first],
        env: { FETCH_DEVEL: "recache", FETCH_DEVEL_RECACHE_INTERVAL: "0" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      const blockedOutput = new TextDecoder().decode(blocked.stdout) +
        new TextDecoder().decode(blocked.stderr);
      expect(blocked.code).toBe(1);
      expect(blockedOutput).toContain("replay-only baseline failed");
      expect(blockedOutput).not.toContain("LIVE_REQUESTS_STARTED");

      // Even with recache enabled, auth behavior assertions must never replace
      // their recorded session values or make a live request.
      const auth = await new Deno.Command(Deno.execPath(), {
        args: [
          "task",
          "test",
          "src/lib/getCrumb.test.ts",
          "--deny-net",
          "--deny-write",
        ],
        env: { FETCH_DEVEL: "recache", FMC_CACHE_MODE: "auto" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      expect(auth.code).toBe(0);
      expect(new TextDecoder().decode(auth.stdout)).toContain(
        "YF_RECACHE_STATS []",
      );

      // The explicit replay task also clears a caller's recache environment.
      const replayAuth = await new Deno.Command(Deno.execPath(), {
        args: ["task", "test:replay", "src/modules/quote.test.ts"],
        env: { FETCH_DEVEL: "recache" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      expect(replayAuth.code).toBe(0);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
