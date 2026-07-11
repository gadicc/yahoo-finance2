import { createServer } from "node:http";
import * as path from "@std/path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import FileCookieStore from "tough-cookie-file-store";

import YahooFinance from "../src/index.ts";
import { ExtendedCookieJar } from "../src/lib/cookieJar.ts";
import type { Logger } from "../src/lib/options/options.ts";
import {
  createYahooFinanceMcpNodeHandler,
  createYahooFinanceMcpServer,
  getYahooFinanceMcpToolNames,
  type YahooFinanceMcpClient,
} from "../src/mcp/mod.ts";
import pkg from "../deno.json" with { type: "json" };

type TransportName = "stdio" | "http";

interface McpCliOptions {
  transport: TransportName;
  host: string;
  port: number;
  path: string;
  token?: string;
  tools?: string[];
  unsafeNoToken: boolean;
}

class UsageError extends Error {
  override name = "UsageError";
}

function getCookiePath() {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME environment variable is not set");
  return path.join(home, ".yf2-cookies.json");
}

function formatForLog(value: unknown) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function createStderrLogger(): Logger {
  return {
    info: (...args) => console.error(...args),
    warn: (...args) => console.error(...args),
    error: (...args) => console.error(...args),
    debug: () => {},
    dir: (value) => console.error(formatForLog(value)),
  };
}

function ensurePrivateFile(filePath: string) {
  try {
    Deno.writeTextFileSync(filePath, "", { createNew: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
  try {
    Deno.chmodSync(filePath, 0o600);
  } catch {
    // chmod is unsupported on Windows; best-effort only.
  }
}

function createClient(logger: Logger): YahooFinanceMcpClient {
  const cookiePath = getCookiePath();
  ensurePrivateFile(cookiePath);
  const cookieJar = new ExtendedCookieJar(new FileCookieStore(cookiePath));
  return new YahooFinance({
    cookieJar,
    logger,
    suppressNotices: ["yahooSurvey"],
  }) as unknown as YahooFinanceMcpClient;
}

function formatHelp() {
  return [
    `yahoo-finance2 MCP server version: ${pkg.version}`,
    "Usage: yahoo-finance-mcp [--stdio]",
    "       yahoo-finance-mcp --http [--host 127.0.0.1] [--port 3000] [--path /mcp]",
    "",
    "Options:",
    "  --stdio                  Run MCP over stdio (default)",
    "  --http                   Run MCP over Streamable HTTP",
    "  --transport <stdio|http> Select transport explicitly",
    "  --host <host>            HTTP bind host (default: 127.0.0.1)",
    "  --port <port>            HTTP bind port (default: 3000)",
    "  --path <path>            HTTP MCP path (default: /mcp)",
    "  --token <token>          Require Authorization: Bearer <token> for HTTP",
    "  --tools <a,b>            Comma-separated allow-list of MCP tools",
    "  --unsafe-no-token        Allow non-local HTTP binding without a token",
    "  -h, --help               Show this help",
    "  -v, --version            Show version",
    "",
    "Environment:",
    "  YAHOO_FINANCE_MCP_TOKEN  HTTP bearer token if --token is omitted",
    "",
    "Available tools:",
    `  ${getYahooFinanceMcpToolNames().join(", ")}`,
  ].join("\n");
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new UsageError(`${flag} requires a value.`);
  }
  return value;
}

function parseArgs(args: string[]): McpCliOptions | "help" | "version" {
  const options: McpCliOptions = {
    transport: "stdio",
    host: "127.0.0.1",
    port: 3000,
    path: "/mcp",
    token: Deno.env.get("YAHOO_FINANCE_MCP_TOKEN") || undefined,
    unsafeNoToken: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case "-h":
      case "--help":
        return "help";
      case "-v":
      case "--version":
        return "version";
      case "--stdio":
        options.transport = "stdio";
        break;
      case "--http":
        options.transport = "http";
        break;
      case "--transport": {
        const value = readValue(args, index, arg);
        if (value !== "stdio" && value !== "http") {
          throw new UsageError("--transport must be either stdio or http.");
        }
        options.transport = value;
        index++;
        break;
      }
      case "--host":
        options.host = readValue(args, index, arg);
        index++;
        break;
      case "--port": {
        const value = Number(readValue(args, index, arg));
        if (!Number.isInteger(value) || value < 0 || value > 65535) {
          throw new UsageError("--port must be an integer from 0 to 65535.");
        }
        options.port = value;
        index++;
        break;
      }
      case "--path": {
        const value = readValue(args, index, arg);
        if (!value.startsWith("/")) {
          throw new UsageError("--path must start with /.");
        }
        options.path = value;
        index++;
        break;
      }
      case "--token":
        options.token = readValue(args, index, arg);
        index++;
        break;
      case "--tools":
        options.tools = readValue(args, index, arg)
          .split(",")
          .map((tool) => tool.trim())
          .filter(Boolean);
        index++;
        break;
      case "--unsafe-no-token":
        options.unsafeNoToken = true;
        break;
      default:
        throw new UsageError(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isLocalHost(host: string) {
  return host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]";
}

async function runStdio(options: McpCliOptions) {
  const client = createClient(createStderrLogger());
  const server = createYahooFinanceMcpServer({
    client,
    version: pkg.version,
    enabledTools: options.tools,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function runHttp(options: McpCliOptions) {
  if (
    !isLocalHost(options.host) &&
    !options.token &&
    !options.unsafeNoToken
  ) {
    throw new UsageError(
      "Refusing to bind HTTP MCP to a non-local host without --token. " +
        "Use --token or --unsafe-no-token.",
    );
  }

  const client = createClient(createStderrLogger());
  const handler = createYahooFinanceMcpNodeHandler({
    client,
    version: pkg.version,
    path: options.path,
    bearerToken: options.token,
    enabledTools: options.tools,
    allowedHosts: isLocalHost(options.host) ? undefined : [],
  });
  const server = createServer(handler);

  server.listen(options.port, options.host, () => {
    const address = server.address();
    const resolvedPort = typeof address === "object" && address
      ? address.port
      : options.port;
    const auth = options.token ? " with bearer token auth" : "";
    console.error(
      `yahoo-finance2 MCP HTTP listening on http://${options.host}:${resolvedPort}${options.path}${auth}`,
    );
  });
}

async function main() {
  try {
    const options = parseArgs(Deno.args);

    if (options === "help") {
      console.log(formatHelp());
      Deno.exit(0);
    }

    if (options === "version") {
      console.log(pkg.version);
      Deno.exit(0);
    }

    if (options.transport === "http") {
      runHttp(options);
    } else {
      await runStdio(options);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `${error instanceof UsageError ? error.name : "Error"}: ${message}`,
    );
    Deno.exit(error instanceof UsageError ? 2 : 1);
  }
}

if (import.meta.main) {
  main();
}
