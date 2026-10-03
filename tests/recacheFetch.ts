/** Pace actual network requests across instances and direct getCrumb calls. */
export function createRecacheFetch(
  fetch: typeof globalThis.fetch,
  interval: number,
  clock = {
    now: () => Date.now(),
    sleep: (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  },
  report: (error: Error) => void = (error) => console.error(error.message),
): typeof globalThis.fetch {
  if (!Number.isFinite(interval) || interval < 0) {
    throw new Error(
      "FETCH_DEVEL_RECACHE_INTERVAL must be a nonnegative finite number",
    );
  }

  let pending: Promise<unknown> = Promise.resolve();
  let lastStart: number | undefined;
  let rateLimit: Error | undefined;

  return (input, init) => {
    const request = pending.then(async () => {
      if (rateLimit) throw rateLimit;
      if (lastStart !== undefined) {
        const delay = lastStart + interval - clock.now();
        if (delay > 0) await clock.sleep(delay);
      }
      lastStart = clock.now();
      const response = await fetch(input, init);
      if (response.status === 429) {
        rateLimit = new Error(
          "Yahoo recache aborted after HTTP 429 Too Many Requests",
        );
        // Print even if a test catches the error: the parent stops the whole run.
        report(rateLimit);
        await response.body?.cancel();
        throw rateLimit;
      }
      return response;
    });
    // A failed fetch must not leave the queue rejected. A 429 remains latched.
    pending = request.catch(() => {});
    return request;
  };
}
