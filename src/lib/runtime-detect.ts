import { getGlobalValue, getRuntimeGlobal } from "./runtimeGlobal.ts";

type RuntimeName = "node" | "deno" | "bun" | "cloudflare" | "unknown";
export interface RuntimeInfo {
  runtime: RuntimeName;
  version: string | null;
  details: Record<string, unknown>;
}
export interface SupportPolicy {
  node?: string;
  deno?: string;
  bun?: string;
  cloudflare?: { requireFeatures?: string[] };
}
export interface SupportCheckResult {
  ok: boolean;
  info: RuntimeInfo;
  reason?: string;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null &&
    (typeof value === "object" || typeof value === "function")
    ? (value as Record<string, unknown>)
    : undefined;
}
function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
/** Unavailable compatibility getters and proxy properties behave like missing APIs. */
function property(value: unknown, key: string): unknown {
  try {
    return record(value)?.[key];
  } catch {
    return undefined;
  }
}
/** Identify host capabilities; mutable compatibility globals are not security identities. */
export function detectRuntime(): RuntimeInfo {
  const proc = getGlobalValue("process");
  const versions = property(proc, "versions");
  const nodeVersion = string(property(versions, "node"));
  const ua = string(property(getGlobalValue("navigator"), "userAgent")) ?? "";
  const workerFeatures =
    typeof getGlobalValue("WebSocketPair") === "function" &&
    record(getGlobalValue("caches")) !== undefined;
  const worker = (): RuntimeInfo => ({
    runtime: "cloudflare",
    version: null,
    details: {
      userAgent: ua || null,
      heuristic: ua !== "Cloudflare-Workers",
      miniflare: !!getGlobalValue("MINIFLARE"),
      hasWebSocketPair: true,
      hasCaches: true,
    },
  });
  // Workers can expose process.versions.node under nodejs_compat. Check their
  // host evidence before touching unrelated Bun or Deno compatibility objects.
  if (
    workerFeatures &&
    (ua === "Cloudflare-Workers" || property(proc, "argv0") === "workerd")
  )
    return worker();
  const bunCompat = string(property(versions, "bun"));
  const denoCompat = string(property(versions, "deno"));
  // A Node host without these markers does not need candidate version getters.
  const bun = !nodeVersion || bunCompat ? getGlobalValue("Bun") : undefined;
  const bunVersion = string(property(bun, "version"));
  const deno = !nodeVersion || denoCompat ? getGlobalValue("Deno") : undefined;
  const denoVersions = property(deno, "version");
  const denoVersion = string(property(denoVersions, "deno"));
  if (workerFeatures && !nodeVersion && !bunVersion && !denoVersion)
    return worker();
  if (bunVersion && (!nodeVersion || bunCompat === bunVersion)) {
    return {
      runtime: "bun",
      version: bunVersion,
      details: {
        bunRevision: property(bun, "revision") ?? null,
        nodeCompat: !!nodeVersion,
      },
    };
  }
  if (denoVersion && (!nodeVersion || denoCompat === denoVersion)) {
    const build = property(deno, "build");
    return {
      runtime: "deno",
      version: denoVersion,
      details: {
        v8: property(denoVersions, "v8"),
        typescript: property(denoVersions, "typescript"),
        os: property(build, "os"),
        arch: property(build, "arch"),
        nodeCompat: !!denoCompat,
      },
    };
  }
  if (nodeVersion) {
    return {
      runtime: "node",
      version: nodeVersion,
      details: {
        v8: property(versions, "v8"),
        arch: property(proc, "arch"),
        platform: property(proc, "platform"),
        denoShimDetected: record(getGlobalValue("Deno")) !== undefined,
      },
    };
  }
  return { runtime: "unknown", version: null, details: {} };
}
interface ParsedSemver {
  core: [number, number, number];
  pre: string[];
}
function parseSemver(version: unknown): ParsedSemver | null {
  if (typeof version !== "string") return null;
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version,
    );
  if (!match) return null;
  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as [
    number,
    number,
    number,
  ];
  if (!core.every(Number.isSafeInteger)) return null;
  const pre = match[4]?.split(".") ?? [];
  if (pre.some((id) => /^\d+$/.test(id) && id.length > 1 && id.startsWith("0")))
    return null;
  return { core, pre };
}
/** Compare strict major.minor.patch versions, including SemVer prerelease precedence. */
export function isVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  const a = parseSemver(current),
    b = parseSemver(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  }
  if (!a.pre.length || !b.pre.length) return !a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i],
      y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return y === undefined;
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    if (xn !== yn) return !xn;
    // Equal-length decimal strings compare numerically without precision loss.
    return xn && x.length !== y.length ? x.length > y.length : x > y;
  }
  return true;
}
/** Check current host against the policy; unknown and malformed versions fail closed. */
export function checkSupport(policy: SupportPolicy = {}): SupportCheckResult {
  const info = detectRuntime();
  const fail = (reason: string): SupportCheckResult => ({
    ok: false,
    info,
    reason,
  });
  const pass = (): SupportCheckResult => ({ ok: true, info });
  for (const [runtime, label] of [
    ["node", "Node"],
    ["deno", "Deno"],
    ["bun", "Bun"],
  ] as const) {
    const minimum = policy[runtime];
    if (info.runtime === runtime && minimum) {
      return isVersionAtLeast(info.version, minimum)
        ? pass()
        : fail(
            `Requires ${label} >= ${minimum}, found ${info.version ?? "unknown"}.`,
          );
    }
  }
  if (info.runtime === "cloudflare") {
    for (const path of policy.cloudflare?.requireFeatures ?? []) {
      let value: unknown = getRuntimeGlobal();
      for (const key of path.split(".")) value = property(value, key);
      if (value == null)
        return fail(`Cloudflare Workers missing required feature: ${path}`);
    }
    return pass();
  }
  return fail("Unsupported runtime.");
}
export function assertSupported(policy: SupportPolicy): void {
  const result = checkSupport(policy);
  if (!result.ok) {
    throw new Error(
      `Unsupported environment: ${result.reason} (runtime=${result.info.runtime}, version=${result.info.version})`,
    );
  }
}
/** Use only the selected runtime's terminal API, preserving Deno's receiver. */
export function stdoutIsTerminal(): boolean {
  const { runtime } = detectRuntime();
  if (runtime === "node" || runtime === "bun") {
    return (
      property(property(getGlobalValue("process"), "stdout"), "isTTY") === true
    );
  }
  if (runtime === "deno") {
    const stdout = property(getGlobalValue("Deno"), "stdout");
    const isTerminal = property(stdout, "isTerminal");
    if (typeof isTerminal === "function") {
      try {
        return Reflect.apply(isTerminal, stdout, []) === true;
      } catch {
        return false;
      }
    }
  }
  return false;
}
