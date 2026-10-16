import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { expect } from "../tests/migration/assertions.ts";
import { test } from "../tests/migration/runner.ts";
import { createCaptureBroker } from "./recache/broker.ts";
import { runCaptureChild } from "./recache/child.ts";

test("real capture child keeps kernel IP denial while its preloaded fetch uses the parent broker", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-capture-child-"));
  const scratch = await mkdtemp(join(tmpdir(), "yf-capture-scratch-"));
  await mkdir(join(scratch, "fixtures"), { mode: 0o700 });
  const target = join(root, "capture.test.ts");
  await writeFile(join(root, "original.json"), "original");
  // A prior child can leave aliases at predictable private filenames. The
  // parent must create fresh exclusive session/report paths instead of writing
  // through those aliases outside the child's readonly boundary.
  await symlink(join(root, "original.json"), join(scratch, "session.json"));
  await symlink(
    join(root, "original.json"),
    join(scratch, "capture-junit.xml"),
  );
  await writeFile(
    target,
    `
    import { test } from "bun:test";
    import { writeFileSync } from "node:fs";
    import { spawnSync } from "node:child_process";
    test("guarded capture", async () => {
      if (process.env.FETCH_DEVEL !== "recache" || process.env.FMC_CACHE_MODE !== "auto") throw Error("mode");
      const raw = spawnSync("python3", ["-c", "import socket; socket.socket(socket.AF_INET, socket.SOCK_STREAM)"], { encoding: "utf8" });
      if (raw.status === 0 || !raw.stderr.includes("Operation not permitted")) throw Error("raw IP escaped");
      try {
        writeFileSync(${JSON.stringify(join(root, "original.json"))}, "changed");
        throw Error("fixture write escaped");
      } catch (error) { if (error.code !== "EROFS") throw error; }
      const response = await fetch("https://query2.finance.yahoo.com/v7/finance/quote?crumb=PRIVATE");
      if ((await response.json()).value !== 42) throw Error("broker response");
      console.log("PRIVATE_COOKIE_CRUMB_DO_NOT_FORWARD");
    });
  `,
  );
  let requests = 0;
  const broker = await createCaptureBroker(
    join(scratch, "broker.sock"),
    async () => {
      requests++;
      return Response.json({ value: 42 });
    },
  );
  try {
    const result = await runCaptureChild(
      root,
      scratch,
      target,
      {
        fixtureRoot: join(scratch, "fixtures"),
        mode: "recache",
        interval: 0,
      },
      broker,
      new AbortController().signal,
      5000,
    );
    expect(result.code).toBe(0);
    expect(requests).toBe(1);
    expect(await readFile(join(root, "original.json"), "utf8")).toBe(
      "original",
    );
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("native capture children reject empty inventory and bounded timeout without leaking diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-capture-child-"));
  const scratch = await mkdtemp(join(tmpdir(), "yf-capture-scratch-"));
  await mkdir(join(scratch, "fixtures"));
  const target = join(root, "capture.test.ts");
  const broker = await createCaptureBroker(
    join(scratch, "broker.sock"),
    async () => {
      throw new Error("Unexpected transport");
    },
  );
  try {
    await writeFile(target, "export {};\n");
    const session = {
      fixtureRoot: join(scratch, "fixtures"),
      mode: "recache" as const,
      interval: 0,
    };
    expect(
      (
        await runCaptureChild(
          root,
          scratch,
          target,
          session,
          broker,
          new AbortController().signal,
          5000,
        )
      ).code,
    ).not.toBe(0);
    await writeFile(
      target,
      `import { test } from "bun:test"; test.skip("skipped", () => {});`,
    );
    expect(
      (
        await runCaptureChild(
          root,
          scratch,
          target,
          session,
          broker,
          new AbortController().signal,
          5000,
        )
      ).code,
    ).not.toBe(0);
    await writeFile(
      target,
      `import { test } from "bun:test"; test.skip("before", () => {}); test("executed", () => {}); test.skip("after", () => {});`,
    );
    expect(
      (
        await runCaptureChild(
          root,
          scratch,
          target,
          session,
          broker,
          new AbortController().signal,
          5000,
        )
      ).code,
    ).toBe(0);
    await writeFile(
      target,
      `import { test } from "bun:test"; test("hung", () => new Promise(() => {}));`,
    );
    expect(
      (
        await runCaptureChild(
          root,
          scratch,
          target,
          session,
          broker,
          new AbortController().signal,
          150,
        )
      ).code,
    ).toBe(124);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("real capture lifecycle flushes an onFinish capture after an assertion failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-capture-child-"));
  const scratch = await mkdtemp(join(tmpdir(), "yf-capture-scratch-"));
  await mkdir(join(scratch, "fixtures"));
  const target = join(root, "capture.test.ts");
  const common = fileURLToPath(new URL("../tests/common.ts", import.meta.url));
  await writeFile(
    target,
    `
    import { it, setupCache, fetchDevel, expect } from ${JSON.stringify(common)};
    setupCache();
    it("schema drift", async (_t, onFinish) => {
      const response = await fetchDevel()("https://query2.finance.yahoo.com/v7/finance/quote", {
        devel: { id: "changed", onFinish },
      });
      expect(await response.json()).toEqual({ oldShape: 1 });
    });
  `,
  );
  const broker = await createCaptureBroker(
    join(scratch, "broker.sock"),
    async () => Response.json({ newShape: 2 }),
  );
  try {
    const result = await runCaptureChild(
      root,
      scratch,
      target,
      {
        fixtureRoot: join(scratch, "fixtures"),
        mode: "recache",
        interval: 0,
      },
      broker,
      new AbortController().signal,
      5000,
    );
    expect(result.code).toBe(1);
    expect(result.stats[0].requests).toBe(1);
    expect(
      JSON.parse(
        await readFile(join(scratch, "fixtures", "changed.json"), "utf8"),
      ).response.bodyJson,
    ).toEqual({ newShape: 2 });
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("internal nocache bypasses reads and writes through real fetchDevel while static/fake replay remains protected", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-nocache-child-"));
  const scratch = await mkdtemp(join(tmpdir(), "yf-nocache-scratch-"));
  const fixtureRoot = join(scratch, "fixtures");
  await mkdir(fixtureRoot);
  const content = (value: number) =>
    JSON.stringify({
      request: { url: "https://query2.finance.yahoo.com/v7/finance/quote" },
      response: {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: {},
        bodyJson: { data: value },
      },
    });
  const original = content(0);
  await writeFile(join(fixtureRoot, "data.json"), original);
  for (const suffix of ["static", "fake"])
    await writeFile(join(fixtureRoot, "data." + suffix + ".json"), content(7));
  const target = join(root, "nocache.test.ts");
  const common = fileURLToPath(new URL("../tests/common.ts", import.meta.url));
  await writeFile(
    target,
    `
    import { it, setupCache, fetchDevel, expect } from ${JSON.stringify(common)};
    setupCache();
    it("nocache real facade", async (_t, onFinish) => {
      expect(process.env.FETCH_DEVEL).toBe("nocache");
      const fetch = fetchDevel();
      const url = "https://query2.finance.yahoo.com/v7/finance/quote";
      expect(await (await fetch(url, { devel: { id: "data", onFinish } })).json()).toEqual({ data: 42 });
      for (const suffix of ["static", "fake"]) {
        expect(await (await fetch(url, { devel: { id: "data." + suffix, onFinish } })).json()).toEqual({ data: 7 });
        await expect(fetch(url, { devel: { id: "missing." + suffix, onFinish } })).rejects.toThrow("cache miss in replay mode");
      }
    });
  `,
  );
  let attempts = 0;
  const broker = await createCaptureBroker(
    join(scratch, "broker.sock"),
    async () => {
      attempts++;
      return Response.json({ data: 42 });
    },
  );
  try {
    const result = await runCaptureChild(
      root,
      scratch,
      target,
      {
        fixtureRoot,
        mode: "nocache",
        interval: 0,
      },
      broker,
      new AbortController().signal,
      5000,
    );
    expect(result.code).toBe(0);
    expect(attempts).toBe(1);
    expect(await readFile(join(fixtureRoot, "data.json"), "utf8")).toBe(
      original,
    );
    expect(await readFile(join(fixtureRoot, "data.static.json"), "utf8")).toBe(
      content(7),
    );
    expect(await readFile(join(fixtureRoot, "data.fake.json"), "utf8")).toBe(
      content(7),
    );
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("benign HTTP429 test titles and logs cannot authorize a rate-limit abort", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-benign-child-"));
  const scratch = await mkdtemp(join(tmpdir(), "yf-benign-scratch-"));
  const fixtureRoot = join(scratch, "fixtures");
  await mkdir(fixtureRoot);
  const target = join(root, "benign.test.ts");
  await writeFile(
    target,
    `import { test } from "bun:test";
    test("handles HTTP 429 safely", () => { console.log("HTTP 429 is a test example"); console.error("Too Many Requests is expected prose"); });`,
  );
  let attempts = 0;
  const broker = await createCaptureBroker(
    join(scratch, "broker.sock"),
    async () => {
      attempts++;
      return new Response("limited", { status: 429 });
    },
  );
  try {
    const result = await runCaptureChild(
      root,
      scratch,
      target,
      {
        fixtureRoot,
        mode: "recache",
        interval: 0,
      },
      broker,
      new AbortController().signal,
      3000,
    );
    expect(result.code).toBe(0);
    expect(result.rateLimited).toBe(false);
    expect(broker.rateLimited).toBe(false);
    expect(attempts).toBe(0);
    await writeFile(
      target,
      `import { test } from "bun:test";
      test("real broker response", async () => { await fetch("https://finance.yahoo.com/quote/AAPL").catch(() => {}); });`,
    );
    const limited = await runCaptureChild(
      root,
      scratch,
      target,
      {
        fixtureRoot,
        mode: "recache",
        interval: 0,
      },
      broker,
      new AbortController().signal,
      3000,
    );
    expect(limited.code).toBe(1);
    expect(limited.rateLimited).toBe(true);
    expect(attempts).toBe(1);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("killed and timed-out native capture children cancel their active parent upstream", async () => {
  for (const mode of ["killed", "timeout"]) {
    const root = await mkdtemp(join(tmpdir(), "yf-cancel-child-"));
    const scratch = await mkdtemp(join(tmpdir(), "yf-cancel-scratch-"));
    const fixtureRoot = join(scratch, "fixtures");
    await mkdir(fixtureRoot);
    const target = join(root, "cancel.test.ts");
    await writeFile(
      target,
      `import { test } from "bun:test";
      test("active upstream", async () => {
        const pending = fetch("https://finance.yahoo.com/quote/AAPL");
        ${mode === "killed" ? 'setTimeout(() => process.kill(process.pid, "SIGKILL"), 100);' : ""}
        await pending;
      });`,
    );
    let active: AbortSignal | null | undefined;
    const broker = await createCaptureBroker(
      join(scratch, "broker.sock"),
      async (_input, init) => {
        active = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          active?.addEventListener(
            "abort",
            () => reject(new Error("Synthetic upstream cancelled")),
            { once: true },
          );
        });
      },
    );
    try {
      const result = await runCaptureChild(
        root,
        scratch,
        target,
        {
          fixtureRoot,
          mode: "recache",
          interval: 0,
        },
        broker,
        new AbortController().signal,
        mode === "timeout" ? 1500 : 3000,
      );
      expect(result.code).toBe(mode === "timeout" ? 124 : 1);
      for (let attempt = 0; attempt < 100 && !active?.aborted; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(active?.aborted).toBe(true);
    } finally {
      await broker.close();
      await rm(root, { recursive: true, force: true });
      await rm(scratch, { recursive: true, force: true });
    }
  }
});
