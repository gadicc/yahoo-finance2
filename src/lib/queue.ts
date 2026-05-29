interface Job {
  func: () => Promise<unknown>;
  // deno-lint-ignore no-explicit-any
  resolve: (arg: any) => void;
  // deno-lint-ignore no-explicit-any
  reject: (arg: any) => void;
}

export interface QueueOptions {
  /** Max number of simultaneous network requests */
  concurrency?: number;
  /** Minimum delay between starting queued requests, in milliseconds */
  interval?: number;
  // timeout?: number; // TODO: request timeout, not queue/rate limiting
}

export default class Queue {
  concurrency = 1;
  interval = 0;

  _running = 0;
  _queue: Array<Job> = [];
  _lastRun = 0;
  _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: QueueOptions = {}) {
    if (typeof opts.concurrency === "number") {
      this.concurrency = opts.concurrency;
    }
    if (typeof opts.interval === "number") {
      this.interval = opts.interval;
    }
  }

  runNext() {
    const job = this._queue.shift();
    if (!job) return;

    this._running++;
    this._lastRun = Date.now();
    job
      .func()
      // deno-lint-ignore no-explicit-any
      .then((result: any) => job.resolve(result))
      // deno-lint-ignore no-explicit-any
      .catch((error: any) => job.reject(error))
      .finally(() => {
        this._running--;
        this.checkQueue();
      });
  }

  checkQueue() {
    if (this._running >= this.concurrency) return;
    if (!this._queue.length) return;

    const delay = this.interval > 0 && this._lastRun > 0
      ? Math.max(0, this._lastRun + this.interval - Date.now())
      : 0;

    if (delay > 0) {
      if (!this._timer) {
        this._timer = setTimeout(() => {
          this._timer = null;
          this.checkQueue();
        }, delay);
      }
      return;
    }

    this.runNext();
    if (this.interval > 0) this.checkQueue();
  }

  add(func: () => Promise<unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._queue.push({ func, resolve, reject });
      this.checkQueue();
    });
  }
}
