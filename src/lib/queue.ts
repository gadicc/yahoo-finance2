interface Job {
  func: () => Promise<unknown>;
  // deno-lint-ignore no-explicit-any
  resolve: (arg: any) => void;
  // deno-lint-ignore no-explicit-any
  reject: (arg: any) => void;
}

export interface QueueOptions {
  // TODO: adds func type to json schema which is not supported
  // tmp enabled, might need to remove again.
  _queue?: Queue;
  concurrency?: number;
  timeout?: number; // TODO
}

export default class Queue {
  concurrency = 1;

  _running = 0;
  _queue: Array<Job> = [];

  constructor(opts: QueueOptions = {}) {
    if (opts.concurrency) this.concurrency = opts.concurrency;
  }

  runNext() {
    const job = this._queue.shift();
    if (!job) return;

    this._running++;
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
    if (this._running < this.concurrency) this.runNext();
  }

  add(func: () => Promise<unknown>) {
    return new Promise((resolve, reject) => {
      this._queue.push({ func, resolve, reject });
      this.checkQueue();
    });
  }
}
