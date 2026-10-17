import { test } from "../tests/helpers/runner.ts";
import { expect } from "../tests/helpers/assertions.ts";
import {
  checkClaims,
  createProxy,
  createTokenProvider,
} from "./openai-wif-proxy.mjs";
import { PassThrough, Readable } from "node:stream";

const now = 1_000_000;
const claims = {
  iss: "https://token.actions.githubusercontent.com",
  aud: "https://api.openai.com/v1",
  repository: "gadicc/yahoo-finance2",
  repository_id: "332135599",
  repository_owner_id: "381978",
  ref: "refs/heads/dev",
  environment: "schema-repair",
  workflow_ref:
    "gadicc/yahoo-finance2/.github/workflows/recache-yahoo-fixtures.yaml@refs/heads/dev",
  sub: "repo:gadicc/yahoo-finance2:environment:schema-repair",
  event_name: "schedule",
  exp: now / 1000 + 300,
};
const jwt = (overrides = {}) =>
  `header.${btoa(JSON.stringify({ ...claims, ...overrides }))}.signature`;
const config = {
  requestURL:
    "https://vstoken.actions.githubusercontent.com/token?api-version=2",
  requestToken: "synthetic-github-credential",
  identityProviderId: "synthetic-provider",
  serviceAccountId: "synthetic-account",
};

test("federation validates exact repository, workflow, environment and event claims", () => {
  expect(checkClaims(jwt(), now).repository).toBe("gadicc/yahoo-finance2");
  for (const override of [
    { ref: "refs/heads/main" },
    { repository: "attacker/fork" },
    { repository_id: "different-repository" },
    { repository_owner_id: "different-owner" },
    {
      workflow_ref:
        "gadicc/yahoo-finance2/.github/workflows/untrusted.yaml@refs/heads/dev",
    },
    { environment: "other-environment" },
    { sub: "repo:gadicc/yahoo-finance2:pull_request" },
    { aud: "wrong-audience" },
    { iss: "https://evil.invalid" },
    { event_name: "pull_request_target" },
    { exp: now / 1000 + 10 },
  ])
    expect(() => checkClaims(jwt(override), now)).toThrow();
});

test("federation reuses valid tokens and single-flights renewal before expiry", async () => {
  let time = now;
  let oidc = 0;
  let exchanges = 0;
  const token = createTokenProvider(
    config,
    async (input: RequestInfo | URL, init?: RequestInit) => {
      await Promise.resolve(); // Exercise simultaneous callers during exchange.
      if (String(input).startsWith("https://vstoken.")) {
        oidc++;
        expect(new URL(String(input)).searchParams.get("audience")).toBe(
          claims.aud,
        );
        return Response.json({ value: jwt({ exp: time / 1000 + 300 }) });
      }
      exchanges++;
      expect(String(input)).toBe("https://auth.openai.com/oauth/token");
      expect(JSON.parse(String(init?.body)).service_account_id).toBe(
        config.serviceAccountId,
      );
      return Response.json({
        access_token: `token-${exchanges}`,
        token_type: "Bearer",
        expires_at: time / 1000 + 300,
        expires_in: 300,
      });
    },
    () => time,
  );
  expect(await Promise.all([token(), token()])).toEqual(["token-1", "token-1"]);
  expect(await token()).toBe("token-1");
  expect(oidc).toBe(1);
  time += 250_000;
  expect(await Promise.all([token(), token()])).toEqual(["token-2", "token-2"]);
  expect(exchanges).toBe(2);
  expect(await token(true)).toBe("token-3");
});

test("federation rejects untrusted endpoints and does not disclose failed exchange bodies", async () => {
  expect(() =>
    createTokenProvider({
      ...config,
      requestURL: "https://evil.invalid/token",
    }),
  ).toThrow("endpoint");
  const token = createTokenProvider(
    config,
    async (input: RequestInfo | URL) => {
      await Promise.resolve();
      if (String(input).startsWith("https://vstoken.")) {
        return Response.json({
          value: jwt(),
        });
      }
      return new Response("sensitive upstream diagnostic", { status: 401 });
    },
    () => now,
  );
  await expect(token()).rejects.toThrow("OpenAI token exchange failed (401)");
});

test("federation proxy restricts paths, methods, local credentials and models", async () => {
  let calls = 0;
  const server = createProxy(
    {
      gatewayToken: "local-only",
      model: "allowed-model",
    },
    () => {
      calls++;
      return Promise.resolve("short-lived-upstream-token");
    },
  );
  const handler = server.listeners("request")[0];
  for (const [url, method, authorization, model, status] of [
    ["/v1/models", "GET", "Bearer local-only", "allowed-model", 404],
    [
      "/v1/responses?target=evil",
      "POST",
      "Bearer local-only",
      "allowed-model",
      404,
    ],
    ["/v1/responses", "GET", "Bearer local-only", "allowed-model", 404],
    ["/v1/responses", "POST", "Bearer wrong", "allowed-model", 401],
    ["/v1/responses", "POST", "Bearer local-only", "other-model", 403],
  ] as const) {
    const request = Object.assign(
      Readable.from([new TextEncoder().encode(JSON.stringify({ model }))]),
      {
        url,
        method,
        headers: { authorization },
      },
    );
    let result = 0;
    const response = Object.assign(new PassThrough(), {
      writeHead(code: number) {
        result = code;
        return this;
      },
    });
    await handler(request, response);
    expect(result).toBe(status);
    request.destroy();
    response.destroy();
  }
  expect(calls).toBe(0);
  server.close();
});

test("federation proxy streams responses, uses exchanged credentials, and renews once on 401", async () => {
  const renewed: boolean[] = [];
  const forwarded: string[] = [];
  const server = createProxy(
    {
      gatewayToken: "local-only",
      model: "allowed-model",
    },
    (force: boolean) => {
      renewed.push(force);
      return Promise.resolve(force ? "renewed-token" : "initial-token");
    },
    async (url: RequestInfo | URL, init?: RequestInit) => {
      await Promise.resolve();
      expect(String(url)).toBe("https://api.openai.com/v1/responses");
      expect(init?.redirect).toBe("error");
      forwarded.push(new Headers(init?.headers).get("authorization")!);
      return forwarded.length === 1
        ? new Response("expired", { status: 401 })
        : new Response("data: success\n\n", {
            headers: { "content-type": "text/event-stream" },
          });
    },
  );
  const handler = server.listeners("request")[0];
  const request = Object.assign(
    Readable.from([
      new TextEncoder().encode(
        JSON.stringify({ model: "allowed-model", stream: true }),
      ),
    ]),
    {
      url: "/v1/responses",
      method: "POST",
      headers: { authorization: "Bearer local-only" },
    },
  );
  let status = 0;
  const response = Object.assign(new PassThrough(), {
    writeHead(code: number) {
      status = code;
      return this;
    },
  });
  let body = "";
  response.on("data", (chunk) => (body += chunk.toString()));
  const finished = new Promise<void>((resolve) =>
    response.once("finish", resolve),
  );
  await handler(request, response);
  await finished;
  expect(status).toBe(200);
  expect(body).toBe("data: success\n\n");
  expect(renewed).toEqual([false, true]);
  expect(forwarded).toEqual(["Bearer initial-token", "Bearer renewed-token"]);
  request.destroy();
  response.destroy();
  server.close();
});
