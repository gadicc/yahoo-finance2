import { test } from "../../tests/helpers/runner.ts";
import {
  createYahooFinanceMcpNodeHandler,
  createYahooFinanceMcpWebHandler,
} from "./http.ts";
import type { YahooFinanceMcpClient } from "./server.ts";

function assert(
  condition: boolean,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

test("createYahooFinanceMcpWebHandler rejects missing host by default", async () => {
  const fakeClient: YahooFinanceMcpClient = {};
  const handler = createYahooFinanceMcpWebHandler({
    client: fakeClient,
  });

  const response = await handler(new Request("http://example.com/mcp"));

  assert(response.status === 403);
  assert((await response.text()).includes("Invalid Host header"));
});

test("createYahooFinanceMcpWebHandler enforces bearer token", async () => {
  const fakeClient: YahooFinanceMcpClient = {};
  const handler = createYahooFinanceMcpWebHandler({
    client: fakeClient,
    bearerToken: "secret",
    allowedHosts: [],
  });

  const response = await handler(new Request("http://example.com/mcp"));

  assert(response.status === 401);
  assert((await response.text()).includes("bearer token"));
});

test("createYahooFinanceMcpWebHandler bearer token validation cases", async () => {
  const fakeClient: YahooFinanceMcpClient = {};
  const handler = createYahooFinanceMcpWebHandler({
    client: fakeClient,
    bearerToken: "secret",
    allowedHosts: [],
  });

  // 1. correct Authorization: Bearer <token>
  {
    const response = await handler(
      new Request("http://example.com/mcp", {
        headers: {
          Authorization: "Bearer secret",
        },
      }),
    );
    // Should not be 401 Unauthorized
    assert(response.status !== 401);
  }

  // 2. wrong token
  {
    const response = await handler(
      new Request("http://example.com/mcp", {
        headers: {
          Authorization: "Bearer wrong",
        },
      }),
    );
    assert(response.status === 401);
    assert((await response.text()).includes("bearer token"));
  }

  // 3. missing header
  {
    const response = await handler(new Request("http://example.com/mcp"));
    assert(response.status === 401);
    assert((await response.text()).includes("bearer token"));
  }

  // 4. token of different length
  {
    const response = await handler(
      new Request("http://example.com/mcp", {
        headers: {
          Authorization: "Bearer short",
        },
      }),
    );
    assert(response.status === 401);
    assert((await response.text()).includes("bearer token"));
  }
});

const initialize = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "host-regression", version: "1" },
  },
});

test("MCP web Host authority validation rejects lists, malformed literals and ports", async () => {
  const handler = createYahooFinanceMcpWebHandler({
    client: {},
    enabledTools: ["quote"],
  });
  for (const host of [
    "localhost",
    "LOCALHOST:80",
    "127.0.0.1:0",
    "[::1]",
    "[::1]:65535",
  ]) {
    const response = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          host,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: initialize,
      }),
    );
    assert(response.status === 200, `${host}: ${response.status}`);
    await response.text();
  }
  for (const host of [
    "localhost,evil.example",
    "[::1]evil.example",
    "[::1]:80evil",
    "localhost:notaport",
    "localhost:65536",
    "localhost:",
    "::1",
    "127.1",
    "localhost@evil.example",
    "localhost/secret",
    "localhost?secret",
  ]) {
    const response = await handler(
      new Request("http://localhost/mcp", {
        headers: { host },
      }),
    );
    assert(response.status === 403, `${host}: ${response.status}`);
    assert(
      (await response.text()).includes('"message":"Invalid Host header."'),
    );
  }
});

test("MCP web Origin and token policy keeps absent Origin allowed and errors sanitized", async () => {
  const handler = createYahooFinanceMcpWebHandler({
    client: {},
    enabledTools: ["quote"],
    allowedOrigins: ["https://client.test"],
    bearerToken: "private-token",
  });
  for (const origin of [
    undefined,
    "https://client.test",
    "https://wrong.test/private-token",
  ]) {
    const response = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          Host: "localhost",
          Authorization: "Bearer private-token",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(origin ? { Origin: origin } : {}),
        },
        body: initialize,
      }),
    );
    assert(response.status === (origin?.includes("wrong") ? 403 : 200));
    assert(!(await response.text()).includes("private-token"));
  }
  const unchecked = createYahooFinanceMcpWebHandler({
    client: {},
    enabledTools: ["quote"],
    allowedHosts: [],
    allowedOrigins: [],
  });
  const response = await unchecked(
    new Request("http://remote.example/mcp", {
      method: "POST",
      headers: {
        Host: "remote.example",
        Origin: "https://any.test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: initialize,
    }),
  );
  assert(response.status === 200);
  await response.text();
});

test("MCP Node handler rejects duplicate Host and malformed target before transport", async () => {
  const handler = createYahooFinanceMcpNodeHandler({ client: {} });
  for (const entry of [
    {
      url: "/mcp",
      headers: { host: "localhost" },
      rawHeaders: ["Host", "localhost", "hOsT", "evil.example"],
      expected: 403,
    },
    {
      url: "/mcp",
      headers: { host: "[::1]suffix" },
      rawHeaders: ["Host", "[::1]suffix"],
      expected: 403,
    },
    {
      url: "http://[/secret-query",
      headers: { host: "localhost" },
      rawHeaders: ["Host", "localhost"],
      expected: 400,
    },
  ]) {
    let status = 0,
      body = "";
    const response = {
      writeHead(value: number) {
        status = value;
      },
      end(value: string) {
        body = value;
      },
    };
    await handler(
      entry as unknown as import("node:http").IncomingMessage,
      response as unknown as import("node:http").ServerResponse,
    );
    assert(status === entry.expected, `${entry.url}: ${status}`);
    assert(
      !body.includes("secret-query") &&
        !body.includes("suffix") &&
        !body.includes("evil.example"),
    );
    assert(JSON.parse(body).jsonrpc === "2.0");
  }
});
