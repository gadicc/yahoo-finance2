import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  projectIt,
  runTest,
  test,
} from "./migration/runner.ts";
import { expect } from "./migration/assertions.ts";
import { spy, stub } from "./migration/mock.ts";
import { FakeTime } from "./migration/time.ts";

for (const asynchronous of [false, true]) {
  test(`finish awaits cleanup after ${asynchronous ? "async rejection" : "sync throw"}`, async () => {
    const failure = new Error("body failed");
    const order: string[] = [];
    await expect(
      runTest((_context, onFinish) => {
        onFinish(async (error) => {
          expect(error).toBe(failure);
          await Promise.resolve();
          order.push("first");
        });
        onFinish(() => {
          order.push("second");
        });
        if (asynchronous) return Promise.reject(failure);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(order).toEqual(["first", "second"]);
  });
}

test("cleanup errors retain body failure and do not skip later cleanup", async () => {
  const body = new Error("body");
  const cleanup = new Error("cleanup");
  const observed: unknown[] = [];
  let error: unknown;
  try {
    await runTest((_context, onFinish) => {
      onFinish(() => {
        throw cleanup;
      });
      onFinish(async (failure) => {
        await Promise.resolve();
        observed.push(failure);
        throw "second cleanup";
      });
      throw body;
    });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([
    body,
    cleanup,
    "second cleanup",
  ]);
  expect(observed).toEqual([body]);
});

test("successful body runs finish once even when finish rejects", async () => {
  const cleanup = new Error("finish rejected");
  const callback = spy(async (error?: unknown) => {
    expect(error).toBeUndefined();
    await Promise.resolve();
    throw cleanup;
  });
  await expect(
    runTest((_context, onFinish) => {
      onFinish(callback);
    }),
  ).rejects.toBe(cleanup);
  expect(callback.calls).toHaveLength(1);
});

test("repeated invocations own callbacks and close registration", async () => {
  let register: Parameters<Parameters<typeof runTest>[0]>[1];
  const callback = spy();
  const body: Parameters<typeof runTest>[0] = (_context, onFinish) => {
    register = onFinish;
    onFinish(callback);
  };
  await runTest(body);
  await runTest(body);
  expect(callback.calls).toHaveLength(2);
  expect(() => register(callback)).toThrow("after the test finished");
});

test("thenables complete before cleanup and thrown undefined still fails", async () => {
  const order: string[] = [];
  await runTest((_context, onFinish) => {
    onFinish(() => {
      order.push("finish");
    });
    return {
      // biome-ignore lint/suspicious/noThenProperty: This fixture deliberately tests PromiseLike assimilation before cleanup.
      then(resolve: () => void) {
        order.push("body");
        resolve();
      },
    } as PromiseLike<void>;
  });
  expect(order).toEqual(["body", "finish"]);
  let rejected = false;
  await runTest(() => {
    throw undefined;
  }).catch(() => {
    rejected = true;
  });
  expect(rejected).toBe(true);
});

test("invalid body returns fail and still drain cleanup", async () => {
  const cleanup = spy();
  const invalid = ((
    _context: unknown,
    onFinish: (cb: typeof cleanup) => void,
  ) => {
    onFinish(cleanup);
    return 123;
  }) as unknown as Parameters<typeof runTest>[0];
  await expect(runTest(invalid)).rejects.toThrow("undefined or a promise");
  expect(cleanup.calls).toHaveLength(1);
  expect(cleanup.calls[0].args[0]).toBeInstanceOf(TypeError);
});

test("optional messages preserve sync, negated, and async assertion diagnostics", async () => {
  expect(() =>
    expect({ nested: [1] }, "payload detail").toEqual({ nested: [2] }),
  ).toThrow(/payload detail[\s\S]*nested/);
  expect(() => expect(1, "negative detail").not.toBe(1)).toThrow(
    "negative detail",
  );
  await expect(
    expect(Promise.resolve(1), "promise detail").resolves.toBe(2),
  ).rejects.toThrow("promise detail");
  await expect(
    expect(Promise.resolve(1), "rejection detail").rejects.toThrow(),
  ).rejects.toThrow("rejection detail");
  await expect(
    expect(
      runInNewContext("Promise.resolve(1)"),
      "cross realm detail",
    ).resolves.toBe(2),
  ).rejects.toThrow("cross realm detail");
  expect(new Map([["key", new Set([1, 2])]])).toEqual(
    new Map([["key", new Set([2, 1])]]),
  );
  expect({ present: undefined }).not.toStrictEqual({});
  expect({ present: undefined }).toEqual({});
});

test("spies retain receiver, return identity, throws and rejected promises", async () => {
  const receiver = { offset: 3 };
  const wrapped = spy(function (this: typeof receiver, value: number) {
    return this.offset + value;
  });
  expect(wrapped.call(receiver, 4)).toBe(7);
  expect(wrapped.calls[0]).toEqual({ args: [4], self: receiver, returned: 7 });
  const failure = new Error("failure");
  const throws = spy(() => {
    throw failure;
  });
  expect(throws).toThrow(failure);
  expect(throws.calls[0].error).toBe(failure);
  expect(Object.hasOwn(throws.calls[0], "returned")).toBe(false);
  const rejected = Promise.reject(failure);
  const asyncSpy = spy(() => rejected);
  expect(asyncSpy()).toBe(rejected);
  await expect(rejected).rejects.toBe(failure);
  expect(asyncSpy.calls[0].returned).toBe(rejected);
  expect(Object.hasOwn(asyncSpy.calls[0], "error")).toBe(false);
});

test("stubs restore own descriptors and inherited methods on disposal", () => {
  const prototype = {
    method() {
      return "prototype";
    },
  };
  const object = Object.create(prototype) as typeof prototype;
  {
    using replacement = stub(object, "method", () => "stub");
    expect(object.method()).toBe("stub");
    expect(replacement.calls[0].self).toBe(object);
  }
  expect(Object.hasOwn(object, "method")).toBe(false);
  expect(object.method()).toBe("prototype");
  Object.defineProperty(object, "method", {
    value: () => "own",
    configurable: true,
    enumerable: false,
    writable: false,
  });
  const descriptor = Object.getOwnPropertyDescriptor(object, "method");
  const replacement = stub(object, "method", () => "replacement");
  expect(object.method()).toBe("replacement");
  replacement.restore();
  replacement.restore();
  expect(Object.getOwnPropertyDescriptor(object, "method")).toEqual(descriptor);
});

test("stubs restore accessors, enforce nesting, and reject immutable properties", () => {
  const object = {
    get method() {
      return () => "accessor";
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(object, "method");
  const outer = stub(object, "method", () => "outer");
  const inner = stub(object, "method", () => "inner");
  expect(() => outer.restore()).toThrow("reverse installation order");
  inner.restore();
  expect(object.method()).toBe("outer");
  outer.restore();
  expect(Object.getOwnPropertyDescriptor(object, "method")).toEqual(descriptor);
  Object.freeze(object);
  expect(() => stub(object, "method", () => "no")).toThrow(TypeError);
  expect(Object.getOwnPropertyDescriptor(object, "method")?.get).toBe(
    descriptor?.get,
  );
});

test("fake clocks preserve timer order, cancellation, intervals, and Date", () => {
  using time = new FakeTime("2000-01-01T00:00:00Z");
  const start = Date.now();
  const order: string[] = [];
  const cancelled = setTimeout(() => {
    order.push("cancelled");
  }, 1);
  clearTimeout(cancelled);
  const interval = setInterval(() => {
    order.push("interval");
  }, 5);
  setTimeout(() => {
    order.push("first");
  }, 10);
  setTimeout(() => {
    order.push("second");
  }, 10);
  time.tick(10);
  clearInterval(interval);
  expect(order).toEqual(["interval", "interval", "first", "second"]);
  expect(Date.now()).toBe(start + 10);
  setTimeout(() => {
    order.push("last");
  }, 3);
  time.runAll();
  expect(order.at(-1)).toBe("last");
  expect(Date.now()).toBe(start + 13);
});

test("async clock ticks drain promises and queueMicrotask between timers", async () => {
  using time = new FakeTime(100);
  const order: string[] = [];
  setTimeout(() => {
    order.push("timer 1");
    Promise.resolve().then(() => {
      order.push("promise");
    });
    queueMicrotask(() => {
      order.push("microtask");
    });
  }, 10);
  setTimeout(() => {
    order.push("timer 2");
  }, 10);
  await time.tickAsync(10);
  expect(order).toEqual(["timer 1", "promise", "microtask", "timer 2"]);
});

test("sync ticks defer native microtasks and disposal survives timer errors", async () => {
  const originals = [
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  ];
  const order: string[] = [];
  try {
    using time = new FakeTime(100);
    setTimeout(() => {
      order.push("timer");
      Promise.resolve().then(() => {
        order.push("promise");
      });
      throw new Error("timer failed");
    }, 1);
    expect(() => time.tick(1)).toThrow("timer failed");
    expect(order).toEqual(["timer"]);
    throw new Error("body failed");
  } catch (error) {
    expect(error).toHaveProperty("message", "body failed");
  }
  await Promise.resolve();
  expect(order).toEqual(["timer", "promise"]);
  expect([Date, setTimeout, clearTimeout, setInterval, clearInterval]).toEqual(
    originals,
  );
  const first = new FakeTime(100);
  first.restore();
  using second = new FakeTime(200);
  first.restore(); // An old disposer must not uninstall the next clock.
  expect(Date.now()).toBe(200);
});

const hookOrder: string[] = [];
describe("native hooks with project test bodies", () => {
  beforeAll(() => {
    hookOrder.push("beforeAll");
  });
  beforeEach(() => {
    hookOrder.push("beforeEach");
  });
  afterEach(() => {
    hookOrder.push("afterEach");
  });
  afterAll(() => {
    expect(hookOrder).toEqual([
      "beforeAll",
      "beforeEach",
      "body",
      "finish",
      "afterEach",
    ]);
  });
  projectIt.each([["name", 7]])(
    "table %s %d",
    (label, number, context, onFinish) => {
      expect([label, number, context]).toEqual(["name", 7, undefined]);
      hookOrder.push("body");
      onFinish(async () => {
        await Promise.resolve();
        hookOrder.push("finish");
      });
    },
    1000,
  );
});

function childTests(sources: string[], flags: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "yf-harness-"));
  try {
    const paths = sources.map((source, index) => {
      const path = join(directory, `${index}.test.ts`);
      writeFileSync(path, source);
      return path;
    });
    const child = spawnSync(process.execPath, ["test", ...flags, ...paths], {
      encoding: "utf8",
      timeout: 20_000,
    });
    if (child.error) throw child.error;
    return { status: child.status, output: child.stdout + child.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const runnerUrl = new URL("./migration/runner.ts", import.meta.url).href;
const assertionsUrl = new URL("./migration/assertions.ts", import.meta.url)
  .href;
const mockUrl = new URL("./migration/mock.ts", import.meta.url).href;

test("native runner fails async cleanup, runs afterEach, and restores globals after failure", () => {
  const child = childTests([
    `
    import { projectIt as it, afterEach } from ${JSON.stringify(runnerUrl)};
    import { expect } from ${JSON.stringify(assertionsUrl)};
    import { stub } from ${JSON.stringify(mockUrl)};
    const originalFetch = globalThis.fetch;
    const originalConsole = console.log;
    const originalEnv = process.env.YF_HARNESS_TEMP;
    afterEach(() => {
      expect(globalThis.fetch).toBe(originalFetch);
      expect(console.log).toBe(originalConsole);
      expect(process.env.YF_HARNESS_TEMP).toBe(originalEnv);
      console.log("AFTER_EACH_RESTORED");
    });
    it("cleanup failure diagnostic", (_context, onFinish) => {
      using fetch = stub(globalThis, "fetch", async () => new Response("stub"));
      using log = stub(console, "log", () => {});
      process.env.YF_HARNESS_TEMP = "changed";
      onFinish(async () => {
        await Promise.resolve();
        if (originalEnv === undefined) delete process.env.YF_HARNESS_TEMP;
        else process.env.YF_HARNESS_TEMP = originalEnv;
        expect(1, "CUSTOM_CLEANUP_DIAGNOSTIC").toBe(2);
      });
    });
    it("body failure restores resources", (_context, onFinish) => {
      using fetch = stub(globalThis, "fetch", async () => new Response("stub"));
      using log = stub(console, "log", () => {});
      process.env.YF_HARNESS_TEMP = "changed";
      onFinish(async (error) => {
        await Promise.resolve();
        if (originalEnv === undefined) delete process.env.YF_HARNESS_TEMP;
        else process.env.YF_HARNESS_TEMP = originalEnv;
        expect(error).toHaveProperty("message", "BODY_FAILURE_DIAGNOSTIC");
      });
      throw new Error("BODY_FAILURE_DIAGNOSTIC");
    });
    it.each(["bounded"])("table %s timeout", () => new Promise(() => {}), 20);
    it("following test", () => { console.log("FOLLOWING_TEST_RAN"); });
  `,
  ]);
  expect(child.status).toBe(1);
  expect(child.output).toContain("CUSTOM_CLEANUP_DIAGNOSTIC");
  expect(child.output.match(/AFTER_EACH_RESTORED/g)).toHaveLength(4);
  expect(child.output).toContain("table bounded timeout");
  expect(child.output).toContain("timed out after 20ms");
  expect(child.output).toContain("BODY_FAILURE_DIAGNOSTIC");
  expect(child.output).toContain("FOLLOWING_TEST_RAN");
});

for (const flags of [["--isolate"], ["--parallel=2"]]) {
  test(`files isolate global mutations (${flags[0]})`, () => {
    const source = `
      import { projectIt as it } from ${JSON.stringify(runnerUrl)};
      import { expect } from ${JSON.stringify(assertionsUrl)};
      let finishCount = 0;
      it("fresh file state", (_context, onFinish) => {
        expect(globalThis.__yfHarnessLeak).toBeUndefined();
        expect(globalThis.fetch.name).not.toBe("leakedFetch");
        expect(console.log.name).not.toBe("leakedLog");
        globalThis.__yfHarnessLeak = true;
        globalThis.fetch = function leakedFetch() {};
        console.log = function leakedLog() {};
        onFinish(async () => { await Promise.resolve(); finishCount++; expect(finishCount).toBe(1); });
      });
    `;
    const child = childTests([source, source], flags);
    expect(child.output, child.output).toContain("2 pass");
    expect(child.status, child.output).toBe(0);
  });
}

for (const flags of [["--isolate"], ["--parallel=2"]]) {
  test(`repeated files await cleanup without retaining callbacks (${flags[0]})`, () => {
    const source = `
      import { projectIt as it } from ${JSON.stringify(runnerUrl)};
      import { expect } from ${JSON.stringify(assertionsUrl)};
      const fetch = globalThis.fetch;
      const log = console.log;
      let bodies = 0;
      let finishes = 0;
      it("repeat cleanup", (_context, onFinish) => {
        expect(globalThis.__yfHarnessLeak).toBeUndefined();
        expect(globalThis.fetch).toBe(fetch);
        expect(console.log).toBe(log);
        bodies++;
        globalThis.__yfHarnessLeak = true;
        globalThis.fetch = function leakedFetch() {};
        console.log = function leakedLog() {};
        onFinish(async () => {
          await Promise.resolve();
          globalThis.fetch = fetch;
          console.log = log;
          delete globalThis.__yfHarnessLeak;
          finishes++;
          expect(finishes).toBe(bodies);
        });
      });
    `;
    const child = childTests([source, source], [...flags, "--rerun-each=2"]);
    expect(child.output, child.output).toContain("4 pass");
    expect(child.status, child.output).toBe(0);
  });
}
