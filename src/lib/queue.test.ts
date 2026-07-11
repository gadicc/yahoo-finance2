import { describe, expect, it } from "../../tests/common.ts";
import Queue from "./queue.ts";
import { FakeTime } from "@std/testing/time";

describe("Queue", () => {
  it("sequential default: concurrency defaults to 1", async () => {
    const queue = new Queue();
    let currentlyRunning = 0;
    let maxCurrentlyRunning = 0;
    const order: number[] = [];

    const makeJob = (id: number, delayMs: number) => {
      return () =>
        new Promise<number>((resolve) => {
          currentlyRunning++;
          maxCurrentlyRunning = Math.max(maxCurrentlyRunning, currentlyRunning);
          order.push(id);
          setTimeout(() => {
            currentlyRunning--;
            resolve(id);
          }, delayMs);
        });
    };

    const p1 = queue.add(makeJob(1, 20));
    const p2 = queue.add(makeJob(2, 10));
    const p3 = queue.add(makeJob(3, 5));

    const results = await Promise.all([p1, p2, p3]);

    expect(results).toEqual([1, 2, 3]);
    expect(maxCurrentlyRunning).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("concurrency bound: respects set concurrency", async () => {
    const queue = new Queue({ concurrency: 2 });
    let currentlyRunning = 0;
    let maxCurrentlyRunning = 0;
    const order: number[] = [];

    const makeJob = (id: number, delayMs: number) => {
      return () =>
        new Promise<number>((resolve) => {
          currentlyRunning++;
          maxCurrentlyRunning = Math.max(maxCurrentlyRunning, currentlyRunning);
          order.push(id);
          setTimeout(() => {
            currentlyRunning--;
            resolve(id);
          }, delayMs);
        });
    };

    // Since concurrency is 2, jobs 1 and 2 should start immediately
    const p1 = queue.add(makeJob(1, 30));
    const p2 = queue.add(makeJob(2, 30));
    const p3 = queue.add(makeJob(3, 10));
    const p4 = queue.add(makeJob(4, 10));

    const results = await Promise.all([p1, p2, p3, p4]);

    expect(results).toEqual([1, 2, 3, 4]);
    expect(maxCurrentlyRunning).toBe(2);
    // Since 1 and 2 start together, 3/4 start after one of them finishes
    expect(order.slice(0, 2)).toEqual(expect.arrayContaining([1, 2]));
  });

  it("rejection propagation: job rejections are handled", async () => {
    const queue = new Queue({ concurrency: 1 });
    const order: string[] = [];

    const p1 = queue.add(() => {
      order.push("start 1");
      return Promise.reject(new Error("fail 1"));
    });

    const p2 = queue.add(() => {
      order.push("start 2");
      return Promise.resolve("success 2");
    });

    await expect(p1).rejects.toThrow("fail 1");
    const res2 = await p2;
    expect(res2).toBe("success 2");
    expect(order).toEqual(["start 1", "start 2"]);
  });

  it("interval pacing: paces job starts with FakeTime", async () => {
    const time = new FakeTime();
    try {
      const queue = new Queue({ interval: 100 });
      const order: number[] = [];

      queue.add(() => {
        order.push(1);
        return Promise.resolve();
      });
      queue.add(() => {
        order.push(2);
        return Promise.resolve();
      });

      // Initially, only the first job should have executed
      await time.tickAsync(0);
      expect(order).toEqual([1]);

      // Move time forward by 99ms, second job shouldn't run yet
      await time.tickAsync(99);
      expect(order).toEqual([1]);

      // Move time past 100ms, second job runs
      await time.tickAsync(1);
      expect(order).toEqual([1, 2]);
    } finally {
      time.restore();
    }
  });

  it("constructor option handling: ignores non-number values", () => {
    // @ts-ignore testing invalid options
    const queue = new Queue({ concurrency: "two", interval: "hundred" });
    expect(queue.concurrency).toBe(1);
    expect(queue.interval).toBe(0);
  });
});
