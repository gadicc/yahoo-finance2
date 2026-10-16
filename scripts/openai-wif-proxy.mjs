// Root-owned, short-lived bridge for codex-action's fixed bearer-token proxy.
// Only standard Node modules are used; proposed source is never evaluated here.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const audience = "https://api.openai.com/v1";
const workflow =
  "gadicc/yahoo-finance2/.github/workflows/recache-yahoo-fixtures.yaml@refs/heads/dev";

/** @param {string} jwt */
export function checkClaims(jwt, now = Date.now()) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid GitHub OIDC token");
  const claims = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
  const expected = {
    iss: "https://token.actions.githubusercontent.com",
    aud: audience,
    repository: "gadicc/yahoo-finance2",
    repository_id: "332135599",
    repository_owner_id: "381978",
    ref: "refs/heads/dev",
    environment: "schema-repair",
    workflow_ref: workflow,
    sub: "repo:gadicc/yahoo-finance2:environment:schema-repair",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (claims[key] !== value) throw new Error(`Unexpected OIDC claim: ${key}`);
  }
  if (
    !["schedule", "workflow_dispatch"].includes(claims.event_name) ||
    !(claims.exp * 1000 > now + 60_000)
  ) {
    throw new Error("Unexpected OIDC event or expiration");
  }
  // This is an additional local check; OpenAI verifies signature and mapping.
  return claims;
}

/**
 * @param {{requestURL: string, requestToken: string, identityProviderId: string, serviceAccountId: string}} config
 * @param {typeof fetch} [fetcher]
 * @param {() => number} [now]
 */
export function createTokenProvider(config, fetcher = fetch, now = Date.now) {
  const request = new URL(config.requestURL);
  if (
    request.protocol !== "https:" ||
    !request.hostname.endsWith(".actions.githubusercontent.com")
  ) {
    throw new Error("Invalid GitHub OIDC endpoint");
  }
  request.searchParams.set("audience", audience);
  /** @type {{value: string, expiresAt: number} | undefined} */
  let cached;
  /** @type {Promise<string> | undefined} */
  let pending;
  return async function token(force = false) {
    if (!force && cached && cached.expiresAt > now() + 60_000) {
      return cached.value;
    }
    if (pending) return pending;
    pending = (async () => {
      const identity = await fetcher(request, {
        headers: { Authorization: `Bearer ${config.requestToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!identity.ok) {
        throw new Error(`GitHub OIDC request failed (${identity.status})`);
      }
      const { value } = await identity.json();
      if (typeof value !== "string") throw new Error("Missing OIDC token");
      const claims = checkClaims(value, now());
      const exchange = await fetcher("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
          subject_token: value,
          identity_provider_id: config.identityProviderId,
          service_account_id: config.serviceAccountId,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!exchange.ok) {
        throw new Error(`OpenAI token exchange failed (${exchange.status})`);
      }
      const result = await exchange.json();
      const expiresAt = Math.min(
        result.expires_at * 1000,
        now() + result.expires_in * 1000,
        claims.exp * 1000,
      );
      if (
        typeof result.access_token !== "string" || !result.access_token ||
        !Number.isFinite(expiresAt) || expiresAt <= now() + 60_000 ||
        result.token_type?.toLowerCase() !== "bearer"
      ) {
        throw new Error("Invalid OpenAI access token response");
      }
      cached = { value: result.access_token, expiresAt };
      return cached.value;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}

/**
 * @param {{gatewayToken: string, model: string}} config
 * @param {(force: boolean) => Promise<string>} token
 * @param {typeof fetch} [fetcher]
 */
export function createProxy(config, token, fetcher = fetch) {
  return createServer(async (req, res) => {
    if (req.url !== "/v1/responses" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== `Bearer ${config.gatewayToken}`) {
      res.writeHead(401).end();
      return;
    }
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const parsed = JSON.parse(body.toString("utf8"));
      if (parsed.model !== config.model) {
        res.writeHead(403).end();
        return;
      }
      const controller = new AbortController();
      res.on("close", () => controller.abort());
      /** @param {boolean} force */
      const send = async (force) =>
        fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await token(force)}`,
            "Content-Type": "application/json",
          },
          body,
          redirect: "error",
          signal: controller.signal,
        });
      let response = await send(false);
      if (response.status === 401) {
        await response.body?.cancel();
        response = await send(true);
      }
      /** @type {Record<string, string>} */
      const headers = {};
      for (
        const name of [
          "content-type",
          "cache-control",
          "x-request-id",
          "retry-after",
        ]
      ) {
        const value = response.headers.get(name);
        if (value) headers[name] = value;
      }
      res.writeHead(response.status, headers);
      if (response.body) {
        // Node and DOM describe BYOB reader generics differently in TS6;
        // this assertion is local to Node's standard WebStream bridge.
        const stream = Readable.fromWeb(
          /** @type {import("node:stream/web").ReadableStream<Uint8Array>} */ (response.body),
        );
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      } else res.end();
    } catch {
      // Never forward exceptions, token responses, or request bodies to logs.
      if (!res.headersSent) {
        res.writeHead(502).end("Federated upstream request failed");
      } else res.destroy();
    }
  });
}

if (
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const config = JSON.parse(input);
    const token = createTokenProvider(config);
    await token(); // Fail before Codex starts if the trust mapping is incorrect.
    const server = createProxy(config, token);
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(
        JSON.stringify({ port: (/** @type {import("node:net").AddressInfo} */ (server.address())).port }) + "\n",
      );
    });
    setTimeout(() => {
      server.closeAllConnections();
      server.close();
    }, 25 * 60_000).unref();
  } catch (error) {
    const failure = /** @type {Error} */ (error);
    // Only known static diagnostics leave the credential-holding process.
    const safe =
      /^(Unexpected OIDC claim: [a-z_]+|GitHub OIDC request failed \([0-9]+\)|OpenAI token exchange failed \([0-9]+\))$/
        .test(failure.message);
    process.stderr.write(
      (safe ? failure.message : "Federation initialization failed") + "\n",
    );
    process.exitCode = 1;
  }
}
