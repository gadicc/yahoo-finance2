import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "../tests/helpers/assertions.ts";
import { test } from "../tests/helpers/runner.ts";
import { brokerFetch, createCaptureBroker } from "./recache/broker.ts";

test("capture broker preserves auth flow bytes and separate cookies over private Unix IPC", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  const calls: Request[] = [];
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      expect(init?.redirect).toBe("manual");
      expect(await request.text()).toBe("consent=accepted");
      expect(request.headers.get("cookie")).toBe("session=PRIVATE");
      return new Response("body-with-crumb", {
        status: 302,
        headers: [
          ["location", "https://finance.yahoo.com/quote/AAPL"],
          ["set-cookie", "A=one; Path=/"],
          ["set-cookie", "B=two; Path=/"],
        ],
      });
    },
  );
  try {
    expect((await stat(broker.socket)).mode & 0o777).toBe(0o600);
    const response = await brokerFetch(broker.socket, broker.token)(
      "https://consent.yahoo.com/v2/collectConsent",
      {
        redirect: "manual",
        method: "POST",
        headers: { cookie: "session=PRIVATE" },
        body: "consent=accepted",
      },
    );
    expect(response.status).toBe(302);
    expect(await response.text()).toBe("body-with-crumb");
    expect(response.headers.getSetCookie()).toEqual([
      "A=one; Path=/",
      "B=two; Path=/",
    ]);
    expect(calls).toHaveLength(1);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("capture broker rejects host, scheme, credential, port and Host-header escapes before transport", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  let attempts = 0;
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async () => {
      attempts++;
      return new Response("unused");
    },
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    for (const url of [
      "http://finance.yahoo.com/quote/AAPL",
      "https://finance.yahoo.com.evil.invalid/",
      "https://127.0.0.1/",
      "https://finance.yahoo.com:444/",
    ])
      await expect(fetch(url)).rejects.toThrow("broker");
    await expect(
      fetch("https://finance.yahoo.com/", {
        headers: { Host: "evil.invalid" },
      }),
    ).rejects.toThrow("broker");
    await expect(
      brokerFetch(broker.socket, "wrong-token")("https://finance.yahoo.com/"),
    ).rejects.toThrow("broker");
    expect(attempts).toBe(0);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("capture broker returns redirects without following and latches caught HTTP 429", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  let attempts = 0;
  let limited = 0;
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async () => {
      attempts++;
      return attempts === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://evil.invalid/" },
          })
        : new Response("PRIVATE_UPSTREAM_BODY", { status: 429 });
    },
    () => limited++,
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    const redirect = await fetch("https://finance.yahoo.com/", {
      redirect: "manual",
    });
    expect(redirect.status).toBe(302);
    await expect(fetch(redirect.headers.get("location")!)).rejects.toThrow(
      "broker",
    );
    expect(
      (await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb")).status,
    ).toBe(429);
    await expect(fetch("https://finance.yahoo.com/")).rejects.toThrow("broker");
    expect(broker.rateLimited).toBe(true);
    expect(limited).toBe(1);
    expect(attempts).toBe(2);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("capture broker sanitizes transport failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async () => {
      throw new Error("COOKIE_CRUMB_PRIVATE_SENTINEL");
    },
  );
  try {
    let caught: unknown;
    try {
      await brokerFetch(
        broker.socket,
        broker.token,
      )("https://finance.yahoo.com/");
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).toContain("broker");
    expect(String(caught)).not.toContain("PRIVATE_SENTINEL");
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("capture redirect modes validate every hop and bound loops", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  const calls: string[] = [];
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async (input) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      if (url.pathname === "/final") return new Response("followed");
      return new Response(null, {
        status: 302,
        headers: {
          location:
            url.pathname === "/blocked"
              ? "https://evil.invalid/"
              : url.pathname === "/loop"
                ? "/loop"
                : "/final",
        },
      });
    },
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    expect(
      (await fetch("https://finance.yahoo.com/start", { redirect: "manual" }))
        .status,
    ).toBe(302);
    expect(calls.splice(0)).toEqual(["/start"]);
    await expect(
      fetch("https://finance.yahoo.com/start", { redirect: "error" }),
    ).rejects.toThrow("broker");
    expect(calls.splice(0)).toEqual(["/start"]);
    const followed = await fetch("https://finance.yahoo.com/start");
    expect(await followed.text()).toBe("followed");
    expect(followed.redirected).toBe(true);
    expect(followed.url).toBe("https://finance.yahoo.com/final");
    expect(calls.splice(0)).toEqual(["/start", "/final"]);
    await expect(fetch("https://finance.yahoo.com/blocked")).rejects.toThrow(
      "broker",
    );
    expect(calls.splice(0)).toEqual(["/blocked"]);
    await expect(fetch("https://finance.yahoo.com/loop")).rejects.toThrow(
      "broker",
    );
    expect(calls.length).toBe(21);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("capture redirects apply POST303 rewriting,307 preservation and cross-origin credential stripping", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  const observed: Array<{
    method: string;
    body: string;
    cookie: string | null;
    auth: string | null;
    type: string | null;
  }> = [];
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/303") || request.url.endsWith("/307")) {
        return new Response(null, {
          status: request.url.endsWith("/303") ? 303 : 307,
          headers: { location: "https://consent.yahoo.com/final" },
        });
      }
      observed.push({
        method: request.method,
        body: await request.text(),
        cookie: request.headers.get("cookie"),
        auth: request.headers.get("authorization"),
        type: request.headers.get("content-type"),
      });
      return new Response("done");
    },
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    for (const status of [303, 307]) {
      await fetch("https://finance.yahoo.com/" + status, {
        method: "POST",
        body: "consent=yes",
        headers: {
          cookie: "PRIVATE",
          authorization: "PRIVATE",
          "content-type": "application/x-www-form-urlencoded",
        },
      });
    }
    expect(observed).toEqual([
      { method: "GET", body: "", cookie: null, auth: null, type: null },
      {
        method: "POST",
        body: "consent=yes",
        cookie: null,
        auth: null,
        type: "application/x-www-form-urlencoded",
      },
    ]);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("broker globally paces redirect hops, concurrent facades and later logical requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  const starts: Array<{ path: string; time: number }> = [];
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async (input) => {
      const path = new URL(String(input)).pathname;
      starts.push({ path, time: performance.now() });
      if (path === "/redirect" || path === "/hop") {
        return new Response(null, {
          status: 302,
          headers: { location: path === "/redirect" ? "/hop" : "/done" },
        });
      }
      return new Response("done");
    },
    undefined,
    80,
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    await Promise.all([
      fetch("https://finance.yahoo.com/redirect"),
      fetch("https://finance.yahoo.com/direct"),
    ]);
    await fetch("https://finance.yahoo.com/later");
    expect(starts.map((row) => row.path).sort()).toEqual([
      "/direct",
      "/done",
      "/hop",
      "/later",
      "/redirect",
    ]);
    for (let index = 1; index < starts.length; index++) {
      expect(
        starts[index].time - starts[index - 1].time,
      ).toBeGreaterThanOrEqual(80);
    }
    expect(broker.getStats().reduce((sum, row) => sum + row.requests, 0)).toBe(
      5,
    );
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("aborted queued callers preserve preceding reservations and a 429 blocks queued transport starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  const starts: Array<{ path: string; time: number }> = [];
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async (input) => {
      starts.push({
        path: new URL(String(input)).pathname,
        time: performance.now(),
      });
      return new Response("done");
    },
    undefined,
    120,
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    await fetch("https://finance.yahoo.com/warm");
    const first = fetch("https://finance.yahoo.com/first");
    const cancelled = new AbortController();
    const second = fetch("https://finance.yahoo.com/cancelled", {
      signal: cancelled.signal,
    });
    const rejected = expect(second).rejects.toThrow();
    const last = fetch("https://finance.yahoo.com/last");
    setTimeout(() => cancelled.abort(), 20);
    await Promise.all([first, rejected, last]);
    expect(starts.map((row) => row.path)).toEqual(["/warm", "/first", "/last"]);
    for (let index = 1; index < starts.length; index++) {
      expect(
        starts[index].time - starts[index - 1].time,
      ).toBeGreaterThanOrEqual(120);
    }
  } finally {
    await broker.close();
  }
  let attempts = 0;
  const limited = await createCaptureBroker(
    join(root, "limited.sock"),
    async () => {
      attempts++;
      return new Response("limited", { status: 429 });
    },
    undefined,
    80,
  );
  try {
    const fetch = brokerFetch(limited.socket, limited.token);
    const results = await Promise.allSettled(
      [1, 2, 3].map((index) => fetch("https://finance.yahoo.com/" + index)),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts).toBe(1);
    expect(limited.rateLimited).toBe(true);
  } finally {
    await limited.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("caller abort cancels the active parent upstream while ordinary request-body completion does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-broker-"));
  let started!: () => void;
  const upstreamStarted = new Promise<void>((resolve) => (started = resolve));
  let stopped!: () => void;
  const upstreamStopped = new Promise<void>((resolve) => (stopped = resolve));
  let calls = 0;
  const broker = await createCaptureBroker(
    join(root, "broker.sock"),
    async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error("Missing upstream signal");
      if (++calls === 1)
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              stopped();
              reject(new Error("Synthetic upstream aborted"));
            },
            { once: true },
          );
          started();
        });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(signal.aborted).toBe(false);
      return new Response("normal body end");
    },
  );
  try {
    const fetch = brokerFetch(broker.socket, broker.token);
    const abort = new AbortController();
    const pending = fetch("https://finance.yahoo.com/abort", {
      signal: abort.signal,
    });
    const rejected = expect(pending).rejects.toThrow();
    await upstreamStarted;
    abort.abort();
    await rejected;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      upstreamStopped,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error("Upstream remained active after caller abort")),
          1000,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    expect(await (await fetch("https://finance.yahoo.com/normal")).text()).toBe(
      "normal body end",
    );
    expect(calls).toBe(2);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});
