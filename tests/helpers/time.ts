import FakeTimers from "@sinonjs/fake-timers";
/** Only the FakeTime API used by this suite; async ticks drain microtasks. */
export class FakeTime {
  private clock;
  private restored = false;
  constructor(now: string | number | Date = Date.now()) {
    this.clock = FakeTimers.install({
      now: typeof now === "string" ? new Date(now) : now,
      toFake: [
        "Date",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
      ],
    });
  }
  tick(ms: number) {
    return this.clock.tick(ms);
  }
  tickAsync(ms: number) {
    return this.clock.tickAsync(ms);
  }
  runAll() {
    return this.clock.runAll();
  }
  restore() {
    if (this.restored) return;
    this.clock.uninstall();
    this.restored = true;
  }
  [Symbol.dispose]() {
    this.restore();
  }
}
