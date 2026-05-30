import { createYahooFinanceMcpWebHandler } from "./http.ts";
import type { YahooFinanceMcpClient } from "./server.ts";

function assert(
  condition: boolean,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("createYahooFinanceMcpWebHandler rejects missing host by default", async () => {
  const fakeClient: YahooFinanceMcpClient = {};
  const handler = createYahooFinanceMcpWebHandler({
    client: fakeClient,
  });

  const response = await handler(new Request("http://example.com/mcp"));

  assert(response.status === 403);
  assert((await response.text()).includes("Invalid Host header"));
});

Deno.test("createYahooFinanceMcpWebHandler enforces bearer token", async () => {
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
