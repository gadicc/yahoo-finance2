import { expect } from "@std/expect";
import createFetchCache from "@gadicc/fetch-mock-cache/runtimes/deno.ts";
import MemoryStore from "@gadicc/fetch-mock-cache/stores/memory.ts";
import { createRecacheFetch } from "./recacheFetch.ts";

function fakeClock() {
  let time = 0;
  const delays: number[] = [];
  return {
    delays,
    now: () => time,
    sleep: (ms: number) => {
      delays.push(ms);
      time += ms;
      return Promise.resolve();
    },
  };
}

Deno.test("recache fetch serializes and spaces requests across callers", async () => {
  const clock = fakeClock();
  const starts: number[] = [];
  const first = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const fetch = createRecacheFetch(
    () => {
      starts.push(clock.now());
      started.resolve();
      return starts.length === 1
        ? first.promise
        : Promise.resolve(new Response());
    },
    3000,
    clock,
  );

  const requests = [
    fetch("https://example.com/one"),
    fetch("https://example.com/two"),
  ];
  await started.promise;
  expect(starts).toEqual([0]);
  first.resolve(new Response());
  await Promise.all(requests);
  expect(starts).toEqual([0, 3000]);
  expect(clock.delays).toEqual([3000]);
});

Deno.test("recache reuses concurrent data requests with independent response bodies", async () => {
  const clock = fakeClock();
  let calls = 0;
  const fetch = createRecacheFetch(
    () => {
      calls++;
      return Promise.resolve(
        new Response("fresh data", {
          headers: { "content-type": "text/plain" },
        }),
      );
    },
    3000,
    clock,
  );
  const url = "https://query2.finance.yahoo.com/v7/finance/quote";
  const responses = await Promise.all([
    fetch(url + "?symbols=AAPL&fields=symbol", {
      headers: { cookie: "session-one" },
    }),
    fetch(
      new Request(url + "?fields=symbol&symbols=AAPL", {
        headers: { cookie: "session-one" },
      }),
    ),
  ]);
  expect(await responses[0].text()).toBe("fresh data");
  expect(await responses[1].text()).toBe("fresh data");
  expect(calls).toBe(1);
  expect(clock.delays).toEqual([]);
  expect(fetch.getStats()).toEqual([{
    endpoint: "query2.finance.yahoo.com/v7/finance/quote",
    requests: 1,
    reused: 1,
    statuses: { "200": 1 },
  }]);
});

Deno.test("recache distinguishes query parameters, sessions, headers, and fetch options", async () => {
  let calls = 0;
  const fetch = createRecacheFetch(
    () => Promise.resolve(new Response(String(++calls))),
    0,
  );
  const url =
    "https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved";
  const requests: [string, RequestInit][] = [
    [url + "?count=20&crumb=one", { headers: { cookie: "one" } }],
    [url + "?count=25&crumb=one", { headers: { cookie: "one" } }],
    [url + "?count=20&crumb=two", { headers: { cookie: "two" } }],
    [url + "?count=20&crumb=one", {
      headers: { cookie: "one", "x-test": "different" },
    }],
    [url + "?count=20&crumb=one", {
      headers: { cookie: "one" },
      redirect: "manual",
    }],
  ];
  for (const [url, init] of requests) await (await fetch(url, init)).text();
  expect(calls).toBe(requests.length);
  expect(fetch.getStats()[0]).toEqual({
    endpoint: "query2.finance.yahoo.com/v1/finance/screener/predefined/saved",
    requests: requests.length,
    reused: 0,
    statuses: { "200": requests.length },
  });
  expect(JSON.stringify(fetch.getStats())).not.toContain("crumb");
  expect(JSON.stringify(fetch.getStats())).not.toContain("cookie");
});

Deno.test("recache leaves auth flows, POST bodies, errors, and new cookies uncached", async () => {
  let calls = 0;
  const bodies: string[] = [];
  const fetch = createRecacheFetch(async (input, init) => {
    calls++;
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.method === "POST") bodies.push(await request.text());
    if (request.url.includes("error")) {
      return new Response("upstream error", { status: 503 });
    }
    if (request.url.includes("new-cookie")) {
      return new Response("session", { headers: { "set-cookie": "A3=new" } });
    }
    return new Response("data");
  }, 0);
  for (let i = 0; i < 2; i++) {
    await (await fetch("https://finance.yahoo.com/quote/AAPL")).text();
    await (await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb"))
      .text();
    await (await fetch(
      new Request("https://consent.yahoo.com/v2/collectConsent", {
        method: "POST",
        body: "consent=yes",
      }),
    )).text();
    await (await fetch(
      "https://query2.finance.yahoo.com/v7/finance/quote?error=yes",
    )).text();
    await (await fetch(
      "https://query2.finance.yahoo.com/v7/finance/quote?new-cookie=yes",
    )).text();
  }
  expect(calls).toBe(10);
  expect(bodies).toEqual(["consent=yes", "consent=yes"]);
  expect(fetch.getStats().reduce((sum, row) => sum + row.reused, 0)).toBe(0);
});

Deno.test("recache respects requests that explicitly require fresh data", async () => {
  let calls = 0;
  const fetch = createRecacheFetch(
    () => Promise.resolve(new Response(String(++calls))),
    0,
  );
  for (const cache of ["no-store", "reload", "no-cache"] as const) {
    const url =
      "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL";
    await (await fetch(url, { cache })).text();
    await (await fetch(url, { cache })).text();
  }
  expect(calls).toBe(6);
  expect(fetch.getStats()[0].reused).toBe(0);
});

Deno.test("recache does not reuse data for an aborted request or after a rate limit", async () => {
  let calls = 0;
  const fetch = createRecacheFetch(
    () =>
      Promise.resolve(
        new Response("data", { status: ++calls === 1 ? 200 : 429 }),
      ),
    0,
    fakeClock(),
    () => {},
  );
  const url = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL";
  await (await fetch(url)).text();
  const controller = new AbortController();
  controller.abort(new Error("cancelled request"));
  await expect(fetch(url, { signal: controller.signal })).rejects.toThrow(
    "cancelled request",
  );
  await expect(fetch(url + "&fields=symbol")).rejects.toThrow(
    "recache aborted",
  );
  await expect(fetch(url)).rejects.toThrow("recache aborted");
  expect(calls).toBe(2);
  expect(fetch.getStats()[0].statuses).toEqual({ "200": 1, "429": 1 });
});

Deno.test("a later failing consumer can store a capture that an earlier passing consumer declined", async () => {
  let calls = 0;
  const cache = createFetchCache({
    Store: MemoryStore,
    fetch: createRecacheFetch(() => {
      calls++;
      return Promise.resolve(new Response("fresh data"));
    }, 0),
  });
  const url = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL";
  const passed = Promise.withResolvers<boolean>();
  cache.once({ id: "passing", mode: "record", writeCache: passed.promise });
  expect(await (await cache(url, {})).text()).toBe("fresh data");
  passed.resolve(false);

  const failed = Promise.withResolvers<boolean>();
  cache.once({ id: "failing", mode: "record", writeCache: failed.promise });
  expect(await (await cache(url, {})).text()).toBe("fresh data");
  failed.resolve(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const store = cache._store as MemoryStore;
  expect([...store.store.keys()]).toEqual(["failing"]);
  expect(calls).toBe(1);
});

Deno.test("replay mode rejects missing fixtures without fetching or storing them", async () => {
  let calls = 0;
  const cache = createFetchCache({
    Store: MemoryStore,
    mode: "replay",
    fetch: () => {
      calls++;
      return Promise.resolve(new Response("unexpected network"));
    },
  });
  cache.once({ id: "absent" });
  await expect(cache("https://query2.finance.yahoo.com/v7/finance/quote", {}))
    .rejects.toThrow("cache miss in replay mode");
  expect(calls).toBe(0);
  expect((cache._store as MemoryStore).store.size).toBe(0);
});

Deno.test("recache fetch latches rate limits before queued requests run", async () => {
  let calls = 0;
  const reports: Error[] = [];
  const fetch = createRecacheFetch(
    () => {
      calls++;
      return Promise.resolve(new Response("limited", { status: 429 }));
    },
    3000,
    fakeClock(),
    (error) => reports.push(error),
  );

  const results = await Promise.allSettled([
    fetch("https://example.com/one"),
    fetch("https://example.com/two"),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    "rejected",
    "rejected",
  ]);
  await expect(fetch("https://example.com/three")).rejects.toThrow(
    "recache aborted",
  );
  expect(calls).toBe(1);
  expect(reports).toHaveLength(1);
});

Deno.test("recache fetch can continue after an ordinary network failure", async () => {
  let calls = 0;
  const fetch = createRecacheFetch(
    () => {
      if (++calls === 1) return Promise.reject(new Error("connection failed"));
      return Promise.resolve(new Response());
    },
    3000,
    fakeClock(),
  );

  await expect(fetch("https://example.com/one")).rejects.toThrow(
    "connection failed",
  );
  expect((await fetch("https://example.com/two")).status).toBe(200);
});

Deno.test("recache cache rejects rate limits before storing and preserves replay", async () => {
  const clock = fakeClock();
  let calls = 0;
  const cache = createFetchCache({
    Store: MemoryStore,
    fetch: createRecacheFetch(
      () => {
        calls++;
        return Promise.resolve(
          calls === 1
            ? new Response("valid")
            : new Response("limited", { status: 429 }),
        );
      },
      3000,
      clock,
      () => {},
    ),
  });
  const goodURL = "https://example.com/good";
  const badURL = "https://example.com/bad";
  cache.once({ id: "good", mode: "record" });
  expect(await (await cache(goodURL, {})).text()).toBe("valid");
  cache.once({ id: "bad", mode: "record" });
  await expect(cache(badURL, {})).rejects.toThrow("recache aborted");

  const store = cache._store as MemoryStore;
  expect([...store.store.keys()]).toEqual(["good"]);
  cache.once({ id: "good", mode: "replay" });
  expect(await (await cache(goodURL, {})).text()).toBe("valid");
  expect(calls).toBe(2);
  expect(clock.delays).toEqual([3000]);
});
