import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import * as modules from "../modules/index.ts";
import * as other from "../other/index.ts";
import {
  createYahooFinanceMcpServer,
  getYahooFinanceMcpToolNames,
  type YahooFinanceMcpClient,
} from "./server.ts";

function assert(
  condition: boolean,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

const intentionallyExcludedPublicMethods = new Set([
  "autoc",
  "dailyGainers",
  "dailyLosers",
]);

Deno.test("getYahooFinanceMcpToolNames returns curated tool names", () => {
  const names = getYahooFinanceMcpToolNames();

  assert(names.includes("quote"));
  assert(names.includes("quoteCombine"));
  assert(names.includes("search"));
  assert(!names.includes("autoc"));
  assert(!names.includes("dailyGainers"));
  assert(!names.includes("dailyLosers"));
});

Deno.test("getYahooFinanceMcpToolNames covers supported public methods", () => {
  const publicMethodNames = [
    ...Object.keys(modules),
    ...Object.keys(other),
  ];
  const expectedToolNames = publicMethodNames
    .filter((name) => !intentionallyExcludedPublicMethods.has(name))
    .sort();
  const actualToolNames = getYahooFinanceMcpToolNames().toSorted();

  assert(
    JSON.stringify(actualToolNames) === JSON.stringify(expectedToolNames),
    `Expected MCP tools ${expectedToolNames.join(", ")}, got ${
      actualToolNames.join(", ")
    }`,
  );
});

Deno.test("createYahooFinanceMcpServer lists and calls a tool", async () => {
  const fakeClient: YahooFinanceMcpClient = {
    quote: (...args) => ({ args }),
  };
  const server = createYahooFinanceMcpServer({
    client: fakeClient,
    version: "test",
    enabledTools: ["quote"],
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const tools = await client.listTools();
    assert(tools.tools.some((tool: { name: string }) => tool.name === "quote"));

    const result = await client.callTool({
      name: "quote",
      arguments: {
        query: "AAPL",
        queryOptions: { return: "object" },
      },
    });
    const textContent = result.content.find((
      item: { type: string },
    ) => item.type === "text");

    assert(textContent?.type === "text");
    assert(textContent.text.includes("AAPL"));
    assert(textContent.text.includes("object"));
  } finally {
    await client.close();
    await server.close();
  }
});

Deno.test("createYahooFinanceMcpServer calls quoteCombine", async () => {
  const fakeClient: YahooFinanceMcpClient = {
    quoteCombine: (...args) => ({ args }),
  };
  const server = createYahooFinanceMcpServer({
    client: fakeClient,
    version: "test",
    enabledTools: ["quoteCombine"],
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const result = await client.callTool({
      name: "quoteCombine",
      arguments: {
        query: "AAPL",
        queryOptions: { fields: ["regularMarketPrice"] },
      },
    });
    const textContent = result.content.find((
      item: { type: string },
    ) => item.type === "text");

    assert(textContent?.type === "text");
    assert(textContent.text.includes("AAPL"));
    assert(textContent.text.includes("regularMarketPrice"));
  } finally {
    await client.close();
    await server.close();
  }
});

Deno.test("createYahooFinanceMcpServer rejects unknown enabled tools", () => {
  const fakeClient: YahooFinanceMcpClient = {};

  try {
    createYahooFinanceMcpServer({
      client: fakeClient,
      enabledTools: ["notATool"],
    });
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("Unknown MCP tool"));
    return;
  }

  throw new Error("Expected unknown tool error.");
});
