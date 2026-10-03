import { recacheEndpoint, type RecacheEndpointStats } from "./recacheStats.ts";

type RecacheFetch = typeof globalThis.fetch & {
  getStats(): RecacheEndpointStats[];
};

interface CapturedResponse {
  body: Uint8Array | null;
  status: number;
  statusText: string;
  headers: [string, string][];
}

function copyResponse(capture: CapturedResponse): Response {
  return new Response(capture.body?.slice() ?? null, capture);
}

/** Auth/consent requests and POSTs must exercise their own state transitions. */
function canReuse(request: Request, url: URL): boolean {
  return request.method === "GET" &&
    !["no-store", "reload", "no-cache"].includes(request.cache) &&
    /^(?:query1|query2)\.finance\.yahoo\.com$/.test(url.hostname) &&
    /^\/(?:v\d+\/finance\/(?:quote|quoteSummary|options|chart|recommendationsbysymbol|search|screener\/predefined\/saved|trending)|ws\/fundamentals-timeseries\/v\d+\/finance\/timeseries|ws\/insights\/v\d+\/finance\/insights)(?:\/|$)/
      .test(url.pathname);
}

/** Compare effective requests, including live credentials, without logging them. */
async function requestKey(request: Request, url: URL): Promise<string> {
  const normalized = new URL(url);
  normalized.searchParams.sort();
  const input = JSON.stringify({
    url: normalized.href,
    headers: [...request.headers],
    credentials: request.credentials,
    redirect: request.redirect,
    mode: request.mode,
    cache: request.cache,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
  });
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
  );
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Pace live fetches, reuse identical data requests, and count endpoint outcomes. */
export function createRecacheFetch(
  fetch: typeof globalThis.fetch,
  interval: number,
  clock = {
    now: () => Date.now(),
    sleep: (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  },
  report: (error: Error) => void = (error) => console.error(error.message),
): RecacheFetch {
  if (!Number.isFinite(interval) || interval < 0) {
    throw new Error(
      "FETCH_DEVEL_RECACHE_INTERVAL must be a nonnegative finite number",
    );
  }

  let pending: Promise<unknown> = Promise.resolve();
  let lastStart: number | undefined;
  let rateLimit: Error | undefined;
  const captures = new Map<string, CapturedResponse>();
  const stats = new Map<string, RecacheEndpointStats>();

  const recacheFetch: typeof globalThis.fetch = (input, init) => {
    const request = pending.then(async () => {
      if (rateLimit) throw rateLimit;
      const effective = new Request(
        input instanceof Request ? input.clone() : input,
        init,
      );
      effective.signal.throwIfAborted();
      const url = new URL(effective.url);
      const endpoint = recacheEndpoint(url);
      let counts = stats.get(endpoint);
      if (!counts) {
        counts = { endpoint, requests: 0, reused: 0, statuses: {} };
        stats.set(endpoint, counts);
      }
      const key = canReuse(effective, url)
        ? await requestKey(effective, url)
        : undefined;
      effective.signal.throwIfAborted();
      const capture = key ? captures.get(key) : undefined;
      if (capture) {
        counts.reused++;
        return copyResponse(capture);
      }
      if (lastStart !== undefined) {
        const delay = lastStart + interval - clock.now();
        if (delay > 0) await clock.sleep(delay);
      }
      effective.signal.throwIfAborted();
      lastStart = clock.now();
      counts.requests++;
      let response: Response;
      try {
        response = await fetch(input, init);
      } catch (error) {
        counts.statuses.networkError = (counts.statuses.networkError ?? 0) + 1;
        throw error;
      }
      counts.statuses[response.status] =
        (counts.statuses[response.status] ?? 0) + 1;
      if (response.status === 429) {
        rateLimit = new Error(
          "Yahoo recache aborted after HTTP 429 Too Many Requests",
        );
        // Print even if a test catches the error: the parent stops the whole run.
        report(rateLimit);
        await response.body?.cancel();
        throw rateLimit;
      }
      // Do not reuse HTTP errors or session-changing responses. Buffer successful
      // data so every consumer gets an independent body and fixture-write choice.
      if (key && response.ok && !response.headers.has("set-cookie")) {
        const capture: CapturedResponse = {
          body: response.body
            ? new Uint8Array(await response.arrayBuffer())
            : null,
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers],
        };
        captures.set(key, capture);
        return copyResponse(capture);
      }
      return response;
    });
    // A failed fetch must not leave the queue rejected. A 429 remains latched.
    pending = request.catch(() => {});
    return request;
  };

  return Object.assign(recacheFetch, {
    getStats: () =>
      [...stats.values()].map((row) => ({
        ...row,
        statuses: { ...row.statuses },
      }))
        .sort((a, b) => a.endpoint.localeCompare(b.endpoint)),
  });
}
