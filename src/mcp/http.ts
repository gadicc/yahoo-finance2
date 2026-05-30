import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import {
  createYahooFinanceMcpServer,
  type CreateYahooFinanceMcpServerOptions,
} from "./server.ts";

export interface YahooFinanceMcpHttpOptions
  extends CreateYahooFinanceMcpServerOptions {
  /** HTTP path that handles MCP requests. Defaults to /mcp. */
  path?: string;
  /** Allowed Host header hostnames. Defaults to localhost hostnames. Empty array disables host checks. */
  allowedHosts?: string[];
  /** Allowed Origin header values. Empty or omitted means Origin is not checked. */
  allowedOrigins?: string[];
  /** Optional bearer token required for every HTTP MCP request. */
  bearerToken?: string;
}

export type YahooFinanceMcpWebHandler = (
  request: Request,
) => Promise<Response>;

export type YahooFinanceMcpNodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

const DEFAULT_ALLOWED_HOSTS = ["127.0.0.1", "localhost", "::1"];

function jsonRpcError(status: number, code: number, message: string) {
  return {
    status,
    body: {
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    },
  };
}

function writeJsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function getHostName(hostHeader: string | null | undefined) {
  const host = hostHeader?.split(",")[0]?.trim();
  if (!host) return undefined;

  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }

  const colonCount = host.split(":").length - 1;
  if (colonCount === 1) return host.split(":")[0];
  return host;
}

function validateHost(
  hostHeader: string | null | undefined,
  allowedHosts: string[],
) {
  if (allowedHosts.length === 0) return undefined;

  const hostname = getHostName(hostHeader);
  if (hostname && allowedHosts.includes(hostname)) return undefined;

  return jsonRpcError(
    403,
    -32000,
    `Invalid Host header: ${hostHeader ?? "(missing)"}`,
  );
}

function validateOrigin(
  origin: string | null | undefined,
  allowedOrigins: string[],
) {
  if (!origin || allowedOrigins.length === 0) return undefined;
  if (allowedOrigins.includes(origin)) return undefined;

  return jsonRpcError(403, -32000, `Invalid Origin header: ${origin}`);
}

function validateBearerToken(
  authorization: string | null | undefined,
  bearerToken: string | undefined,
) {
  if (!bearerToken) return undefined;
  if (authorization === `Bearer ${bearerToken}`) return undefined;

  return jsonRpcError(401, -32001, "Missing or invalid bearer token.");
}

function validateRequestHeaders(
  headers: Headers,
  options: YahooFinanceMcpHttpOptions,
) {
  const allowedHosts = options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  return validateHost(headers.get("host"), allowedHosts) ??
    validateOrigin(headers.get("origin"), options.allowedOrigins ?? []) ??
    validateBearerToken(headers.get("authorization"), options.bearerToken);
}

function validateNodeRequestHeaders(
  req: IncomingMessage,
  options: YahooFinanceMcpHttpOptions,
) {
  const allowedHosts = options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const header = (name: string) => {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return validateHost(header("host"), allowedHosts) ??
    validateOrigin(header("origin"), options.allowedOrigins ?? []) ??
    validateBearerToken(header("authorization"), options.bearerToken);
}

async function closeServer(server: { close: () => Promise<void> | void }) {
  try {
    await server.close();
  } catch {
    // Nothing useful to report after a request is already complete.
  }
}

export function createYahooFinanceMcpWebHandler(
  options: YahooFinanceMcpHttpOptions,
): YahooFinanceMcpWebHandler {
  const path = options.path ?? "/mcp";

  return async function handleYahooFinanceMcpRequest(
    request: Request,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== path) {
      return new Response("Not Found", { status: 404 });
    }

    const validationError = validateRequestHeaders(request.headers, options);
    if (validationError) {
      return Response.json(validationError.body, {
        status: validationError.status,
      });
    }

    const server = createYahooFinanceMcpServer(options);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const response = jsonRpcError(500, -32603, message);
      return Response.json(response.body, { status: response.status });
    } finally {
      await transport.close();
      await closeServer(server);
    }
  };
}

export function createYahooFinanceMcpNodeHandler(
  options: YahooFinanceMcpHttpOptions,
): YahooFinanceMcpNodeHandler {
  const path = options.path ?? "/mcp";

  return async function handleYahooFinanceMcpNodeRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ) {
    const host = Array.isArray(req.headers.host)
      ? req.headers.host[0]
      : req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);

    if (url.pathname !== path) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const validationError = validateNodeRequestHeaders(req, options);
    if (validationError) {
      writeJsonResponse(res, validationError.status, validationError.body);
      return;
    }

    const server = createYahooFinanceMcpServer(options);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : String(error);
        const response = jsonRpcError(500, -32603, message);
        writeJsonResponse(res, response.status, response.body);
      } else {
        res.end();
      }
    } finally {
      await transport.close();
      await closeServer(server);
    }
  };
}
