import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  type Stats,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import FileCookieStore from "tough-cookie-file-store";
import { ExtendedCookieJar } from "../src/lib/cookieJar.ts";

/** Resolve npm's executable symlink as well as direct Bun/Node entrypoints. */
export function isMainModule(url: string, entry = process.argv[1]): boolean {
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(url)) ===
      realpathSync(path.resolve(entry));
  } catch {
    return false;
  }
}

export function getCookiePath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const home = env.HOME ||
    (platform === "win32"
      ? env.USERPROFILE ||
        (env.HOMEDRIVE && env.HOMEPATH
          ? env.HOMEDRIVE + env.HOMEPATH
          : undefined)
      : undefined);
  if (!home) throw new Error("HOME environment variable is not set");
  return (platform === "win32" ? path.win32 : path).join(
    home,
    ".yf2-cookies.json",
  );
}

interface PrivateFileSystem {
  open: (file: string, flags: number, mode?: number) => number;
  lstat: (file: string) => Stats;
  fstat: (fd: number) => Stats;
  chmod: (fd: number, mode: number) => void;
  close: (fd: number) => void;
}

const fileSystem: PrivateFileSystem = {
  open: openSync,
  lstat: lstatSync,
  fstat: fstatSync,
  chmod: fchmodSync,
  close: closeSync,
};

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)
    ? code
    : undefined;
}

/** New files are private from their first instant; existing contents are preserved. */
export function ensurePrivateFile(
  file: string,
  options: { platform?: NodeJS.Platform; fs?: PrivateFileSystem } = {},
): void {
  const fs = options.fs ?? fileSystem;
  const platform = options.platform ?? process.platform;
  let fd: number | undefined;
  try {
    try {
      fd = fs.open(
        file,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR |
          (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = fs.lstat(file);
      if (!existing.isFile() || existing.isSymbolicLink()) {
        throw new Error("not a regular file");
      }
      // NONBLOCK avoids hanging if a regular file is replaced with a FIFO.
      fd = fs.open(
        file,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0),
      );
    }
    const opened = fs.fstat(fd);
    const current = fs.lstat(file);
    if (
      !opened.isFile() || !current.isFile() || current.isSymbolicLink() ||
      opened.dev !== current.dev || opened.ino !== current.ino
    ) throw new Error("not a stable regular file");
    try {
      fs.chmod(fd, 0o600);
    } catch (error) {
      // Windows permissions/ACLs do not implement POSIX mode bits consistently.
      if (
        platform !== "win32" ||
        !["ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EINVAL"].includes(
          errorCode(error) ?? "",
        )
      ) throw error;
    }
  } catch {
    // Do not surface file contents or upstream parser diagnostics on stderr.
    throw new Error(
      "Unable to prepare the private cookie store; use a regular file with owner-only access.",
    );
  } finally {
    if (fd !== undefined) {
      try {
        fs.close(fd);
      } catch {
        throw new Error("Unable to close the private cookie store.");
      }
    }
  }
}

export function createCookieJar(
  env: NodeJS.ProcessEnv = process.env,
): ExtendedCookieJar {
  const file = getCookiePath(env);
  ensurePrivateFile(file);
  const warn = console.warn;
  try {
    // This synchronous dependency constructor can log raw malformed cookies.
    // Bound its warnings to a fixed diagnostic and restore the logger at once.
    console.warn = () => warn("Warning: Unable to parse a cookie store entry.");
    return new ExtendedCookieJar(
      new FileCookieStore(file, { loadAsync: false }),
    );
  } catch {
    throw new Error("Unable to load the private cookie store.");
  } finally {
    console.warn = warn;
  }
}

export async function readUtf8(
  input: AsyncIterable<string | Uint8Array> = process.stdin,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Closing stdin or receiving a signal closes MCP resources without forced exit. */
export function closeOnSignals(
  close: () => void | Promise<void>,
  stdin?: NodeJS.ReadableStream,
) {
  let closing: Promise<void> | undefined;
  const dispose = () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    stdin?.off("end", shutdown);
  };
  const shutdown = () => {
    closing ??= Promise.resolve().then(close).catch(() => {
      console.error("Unable to close the MCP server cleanly.");
      process.exitCode = 1;
    }).finally(dispose);
    return closing;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  stdin?.once("end", shutdown);
  return { shutdown, dispose };
}
