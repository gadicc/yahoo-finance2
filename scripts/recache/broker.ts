import { createServer, request, type IncomingMessage } from "node:http";
import { chmod, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  recacheEndpoint,
  type RecacheEndpointStats,
} from "../../tests/recacheStats.ts";

export const captureHosts = new Set([
  "finance.yahoo.com",
  "guce.yahoo.com",
  "consent.yahoo.com",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
]);
const maximumRequest = 2 * 1024 * 1024;
const maximumResponse = 64 * 1024 * 1024;
const deadline = 30000;
// Capture a monotonic clock and real timers before behavior tests fake globals.
const realNow = performance.now.bind(performance);
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);

function waitForSlot(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = realSetTimeout(finish, milliseconds);
    const cancel = () => {
      realClearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new Error("Capture request aborted while queued"));
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

interface WireRequest {
  url: string;
  method: string;
  redirect: RequestRedirect;
  headers: [string, string][];
  body?: string;
  fixtureId?: string;
}

interface WireResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  url: string;
  redirected: boolean;
}

/** Validate each hop in the parent; redirects are always returned to the child. */
function validateRequest(value: unknown): WireRequest {
  if (!value || typeof value !== "object")
    throw new Error("Invalid capture request");
  const data = value as WireRequest;
  const url = new URL(data.url);
  if (
    url.protocol !== "https:" ||
    !captureHosts.has(url.hostname) ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    !["GET", "HEAD", "POST"].includes(data.method) ||
    !["follow", "manual", "error"].includes(data.redirect) ||
    (data.fixtureId !== undefined &&
      (typeof data.fixtureId !== "string" || data.fixtureId.length > 4096)) ||
    !Array.isArray(data.headers) ||
    data.headers.length > 200 ||
    data.headers.some(
      (header) =>
        !Array.isArray(header) ||
        header.length !== 2 ||
        header.some((part) => typeof part !== "string") ||
        /^(?:host|connection|transfer-encoding|content-length|proxy-.*)$/i.test(
          header[0],
        ),
    ) ||
    (data.body !== undefined &&
      (typeof data.body !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(data.body)))
  )
    throw new Error("Capture request outside allowed policy");
  return data;
}

async function readBounded(
  source: AsyncIterable<Uint8Array>,
  limit: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of source) {
    size += chunk.length;
    if (size > limit) throw new Error("Capture message exceeds size limit");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export type CaptureTransport = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  fixtureId?: string,
) => Promise<Response>;

/** Only fixed endpoint families reach command output; arbitrary paths are omitted. */
export function captureEndpoint(url: URL): string {
  const endpoint = recacheEndpoint(url);
  const path = endpoint.slice(url.host.length);
  const safe = [
    /^\/v\d+\/finance\/(?:quote|quoteSummary|options|chart|recommendationsbysymbol|search)(?:\/:symbol)?$/,
    /^\/v\d+\/finance\/(?:screener\/predefined\/saved|trending(?:\/:country)?)$/,
    /^\/ws\/fundamentals-timeseries\/v\d+\/finance\/timeseries(?:\/:symbol)?$/,
    /^\/ws\/insights\/v\d+\/finance\/insights(?:\/:symbol)?$/,
    /^\/(?:v1\/test\/getcrumb|quote\/AAPL|consent|v2\/(?:collectConsent|copyConsent))$/,
  ].some((pattern) => pattern.test(path));
  return url.host + (safe ? path : "/:other");
}

export interface CaptureBroker {
  socket: string;
  token: string;
  readonly rateLimited: boolean;
  getStats(): RecacheEndpointStats[];
  close(): Promise<void>;
}

/**
 * The child keeps its kernel network denial. Only this parent-side broker can
 * reach the exact HTTPS hosts above. Transport injection is an internal test
 * seam, never an environment variable or public command option.
 */
export async function createCaptureBroker(
  socket: string,
  transport: CaptureTransport = globalThis.fetch,
  onRateLimit: () => void = () => {},
  interval = 0,
): Promise<CaptureBroker> {
  if (!Number.isFinite(interval) || interval < 0 || interval > 2147483647) {
    throw new Error("Invalid capture broker pacing interval");
  }
  const token = randomBytes(32).toString("hex");
  let rateLimited = false;
  let closed = false;
  let lastStart: number | undefined;
  let starts: Promise<void> = Promise.resolve();
  const counters = new Map<string, RecacheEndpointStats>();
  const active = new Set<AbortController>();
  const server = createServer((incoming, outgoing) => {
    const abort = new AbortController();
    // Request-body `end` is normal. Only a response connection that closes
    // before finishing means the caller no longer owns the upstream request.
    const disconnected = () => {
      if (!outgoing.writableFinished) abort.abort();
    };
    outgoing.once("close", disconnected);
    void handle(incoming, abort)
      .then(
        (result) => {
          if (outgoing.destroyed) return;
          outgoing.writeHead(200, { "content-type": "application/json" });
          outgoing.end(JSON.stringify(result));
        },
        () => {
          // Never forward an upstream error, URL query, cookie, crumb or payload.
          if (outgoing.destroyed) return;
          outgoing.writeHead(502, { "content-type": "application/json" });
          outgoing.end('{"error":"Capture broker rejected or failed request"}');
        },
      )
      .finally(() => outgoing.off("close", disconnected))
      .catch(() => outgoing.destroy());
  });
  server.requestTimeout = deadline;
  server.headersTimeout = deadline;
  async function transportHop(hop: WireRequest, abort: AbortController) {
    const turn = starts.then(async () => {
      abort.signal.throwIfAborted();
      while (lastStart !== undefined && realNow() < lastStart + interval) {
        await waitForSlot(lastStart + interval - realNow(), abort.signal);
      }
      abort.signal.throwIfAborted();
      if (closed || rateLimited) throw new Error("Capture broker unavailable");
      validateRequest(hop);
      const endpoint = captureEndpoint(new URL(hop.url));
      let counts = counters.get(endpoint);
      if (!counts) {
        counts = { endpoint, requests: 0, reused: 0, statuses: {} };
        counters.set(endpoint, counts);
      }
      counts.requests++;
      let response: Promise<Response>;
      try {
        response = Promise.resolve(
          transport(
            hop.url,
            {
              method: hop.method,
              headers: hop.headers,
              body:
                hop.body === undefined
                  ? undefined
                  : Buffer.from(hop.body, "base64"),
              redirect: "manual",
              signal: abort.signal,
            },
            hop.fixtureId,
          ),
        );
      } catch (error) {
        response = Promise.reject(error);
      } finally {
        // Timestamp after the synchronous start, so callback overhead cannot
        // shorten spacing measured at the next actual transport invocation.
        lastStart = realNow();
      }
      return { response, counts };
    });
    // Admission is serialized, not response completion. Cancellation keeps its
    // position in this chain; it cannot release a later caller ahead of a
    // preceding reservation. Every admitted hop rechecks abort and the 429 latch.
    starts = turn.then(
      () => {},
      () => {},
    );
    const { response, counts } = await turn;
    try {
      const result = await response;
      counts.statuses[result.status] =
        (counts.statuses[result.status] ?? 0) + 1;
      return result;
    } catch (error) {
      counts.statuses.networkError = (counts.statuses.networkError ?? 0) + 1;
      throw error;
    }
  }
  async function handle(
    incoming: IncomingMessage,
    abort: AbortController,
  ): Promise<WireResponse> {
    if (
      incoming.method !== "POST" ||
      incoming.url !== "/fetch" ||
      incoming.headers.authorization !== `Bearer ${token}` ||
      rateLimited
    )
      throw new Error("Capture broker unavailable");
    const data = validateRequest(
      JSON.parse(
        (await readBounded(incoming, maximumRequest)).toString("utf8"),
      ),
    );
    abort.signal.throwIfAborted();
    active.add(abort);
    const timer = setTimeout(() => abort.abort(), deadline);
    let hop = data;
    let redirects = 0;
    try {
      while (true) {
        if (rateLimited) throw new Error("Capture broker rate limited");
        validateRequest(hop); // Every new authority/hop is checked before I/O.
        const response = await transportHop(hop, abort);
        if (response.status === 429) {
          rateLimited = true;
          onRateLimit();
          for (const other of active) if (other !== abort) other.abort();
        }
        const redirect = [301, 302, 303, 307, 308].includes(response.status);
        const location = response.headers.get("location");
        if (redirect && hop.redirect === "error") {
          await response.body?.cancel();
          throw new Error("Capture redirect forbidden");
        }
        if (redirect && location && hop.redirect === "follow") {
          await response.body?.cancel();
          if (++redirects > 20)
            throw new Error("Capture redirect limit exceeded");
          const previous = new URL(hop.url);
          const next = new URL(location, previous);
          let headers = hop.headers;
          if (previous.origin !== next.origin) {
            headers = headers.filter(
              ([name]) => !/^(?:authorization|cookie|cookie2)$/i.test(name),
            );
          }
          const rewrite =
            ((response.status === 301 || response.status === 302) &&
              hop.method === "POST") ||
            (response.status === 303 && !["GET", "HEAD"].includes(hop.method));
          if (rewrite)
            headers = headers.filter(
              ([name]) =>
                !/^content-(?:encoding|language|location|type)$/i.test(name),
            );
          hop = {
            ...hop,
            url: next.href,
            headers,
            method: rewrite ? "GET" : hop.method,
            body: rewrite ? undefined : hop.body,
          };
          continue;
        }
        const body = response.body
          ? await readBounded(response.body, maximumResponse)
          : Buffer.alloc(0);
        const headers: [string, string][] = [];
        for (const [name, value] of response.headers) {
          if (name.toLowerCase() !== "set-cookie") headers.push([name, value]);
        }
        for (const cookie of response.headers.getSetCookie())
          headers.push(["set-cookie", cookie]);
        return {
          status: response.status,
          statusText: response.statusText,
          headers,
          body: body.toString("base64"),
          url: hop.url,
          redirected: redirects > 0,
        };
      }
    } finally {
      clearTimeout(timer);
      active.delete(abort);
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socket, resolve);
    });
    await chmod(socket, 0o600);
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    socket,
    token,
    get rateLimited() {
      return rateLimited;
    },
    getStats() {
      return [...counters.values()].map((row) => ({
        ...row,
        statuses: { ...row.statuses },
      }));
    },
    async close() {
      closed = true;
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(socket, { force: true });
    },
  };
}

/** Fetch facade transported exclusively over the guarded child's Unix socket. */
export function brokerFetch(socket: string, token: string): typeof fetch {
  return async (input, init) => {
    const effective = new Request(input, init);
    const body = effective.body
      ? Buffer.from(await effective.arrayBuffer()).toString("base64")
      : undefined;
    const devel = (init as { devel?: string | { id?: string } } | undefined)
      ?.devel;
    const data: WireRequest = {
      url: effective.url,
      method: effective.method,
      redirect: effective.redirect,
      headers: [...effective.headers],
      body,
      fixtureId: typeof devel === "string" ? devel : devel?.id,
    };
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized) > maximumRequest) {
      throw new Error("Capture request exceeds size limit");
    }
    return await new Promise<Response>((resolve, reject) => {
      const outgoing = request(
        {
          socketPath: socket,
          path: "/fetch",
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "content-length": Buffer.byteLength(serialized),
          },
          signal: effective.signal,
          timeout: deadline,
        },
        (incoming) => {
          void (async () => {
            if (incoming.statusCode !== 200)
              throw new Error("Capture broker rejected request");
            const value: WireResponse = JSON.parse(
              (await readBounded(incoming, maximumResponse * 2)).toString(
                "utf8",
              ),
            );
            const response = new Response(
              [101, 204, 205, 304].includes(value.status) ||
                effective.method === "HEAD"
                ? null
                : Buffer.from(value.body, "base64"),
              {
                status: value.status,
                statusText: value.statusText,
                headers: value.headers,
              },
            );
            Object.defineProperties(response, {
              url: { value: value.url },
              redirected: { value: value.redirected },
            });
            resolve(response);
          })().catch(reject);
        },
      );
      outgoing.once("error", () =>
        reject(new Error("Capture broker request failed")),
      );
      outgoing.once("timeout", () =>
        outgoing.destroy(new Error("Capture broker timed out")),
      );
      outgoing.end(serialized);
    });
  };
}
