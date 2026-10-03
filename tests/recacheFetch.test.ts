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
