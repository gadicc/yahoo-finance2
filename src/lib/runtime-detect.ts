// deno-coverage-ignore-file
// deno-lint-ignore-file no-explicit-any
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
  cloudflare?: {
    requireFeatures?: string[];
  };
}

export interface SupportCheckResult {
  ok: boolean;
  info: RuntimeInfo;
  reason?: string;
}

/** Detect the current JS runtime and version (if available). */
export function detectRuntime(): RuntimeInfo {
  const info: RuntimeInfo = { runtime: "unknown", version: null, details: {} };

  const deno = getGlobalValue("Deno") as any;
  const proc = getGlobalValue("process") as any;
  const bun = getGlobalValue("Bun") as any;

  // Heuristic: real Deno exposes build info alongside a deno version.
  const isRealDeno = (d: any): boolean =>
    !!(d && d.version?.deno && d.build?.os && d.build?.arch);

  // Cloudflare Workers (workerd)
  const navigator = getGlobalValue("navigator") as
    | { userAgent?: unknown }
    | undefined;
  const ua =
    (typeof navigator === "object" && typeof navigator?.userAgent === "string")
      ? navigator.userAgent
      : "";
  if (/Cloudflare-Workers/i.test(ua)) {
    info.runtime = "cloudflare";
    info.version = null;
    info.details = {
      userAgent: ua,
      miniflare: !!getGlobalValue("MINIFLARE") || /Miniflare/i.test(ua),
      hasWebSocketPair: typeof getGlobalValue("WebSocketPair") !== "undefined",
      hasCaches: typeof getGlobalValue("caches") !== "undefined",
    };
    return info;
  }
  if (
    typeof getGlobalValue("process") === "undefined" &&
    typeof getGlobalValue("Deno") === "undefined" &&
    typeof getGlobalValue("Bun") === "undefined" &&
    typeof getGlobalValue("WebSocketPair") !== "undefined" &&
    typeof getGlobalValue("caches") !== "undefined"
  ) {
    info.runtime = "cloudflare";
    info.version = null;
    info.details = { userAgent: ua || null, heuristic: true };
    return info;
  }

  // Bun
  if (typeof bun === "object" && typeof bun?.version === "string") {
    info.runtime = "bun";
    info.version = bun.version;
    info.details = {
      bunRevision: bun.revision ?? null,
      nodeCompat: (typeof proc === "object") && !!proc?.versions?.node,
    };
    return info;
  }

  // Prefer Node when process.versions.node exists but process.versions.deno does not.
  const hasNode = typeof proc === "object" && !!proc?.versions?.node;
  const nodeDominant = hasNode && !proc?.versions?.deno;

  if (nodeDominant) {
    info.runtime = "node";
    info.version = String(proc.versions.node);
    info.details = {
      v8: proc.versions.v8,
      arch: proc.arch,
      platform: proc.platform,
      denoShimDetected: typeof deno === "object",
    };
    return info;
  }

  // Prefer "real Deno"; otherwise Deno compat in Deno will still identify as Deno.
  const hasDeno = typeof deno === "object" && !!deno?.version?.deno;

  if (hasDeno && (!hasNode || isRealDeno(deno) || proc?.versions?.deno)) {
    info.runtime = "deno";
    info.version = String(deno.version.deno);
    info.details = {
      v8: deno.version.v8,
      typescript: deno.version.typescript,
      os: deno.build?.os,
      arch: deno.build?.arch,
      nodeCompat: !!proc?.versions?.deno,
    };
    return info;
  }

  // Fallback Node
  if (hasNode) {
    info.runtime = "node";
    info.version = String(proc.versions.node);
    info.details = {
      v8: proc.versions.v8,
      arch: proc.arch,
      platform: proc.platform,
    };
    return info;
  }

  return info;
}

interface ParsedSemver {
  maj: number;
  min: number;
  pat: number;
  pre: string;
}

/** Minimal semver parser (major.minor.patch only; pre-release makes it "lower"). */
function parseSemver(v: unknown): ParsedSemver | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (s.startsWith("v")) s = s.slice(1);
  const core = s.split("+")[0];
  const [nums, pre = ""] = core.split("-");
  const [maj = "0", min = "0", pat = "0"] = nums.split(".");
  const toInt = (x: unknown) => {
    const n = parseInt(String(x), 10);
    return Number.isFinite(n) ? n : 0;
  };
  return { maj: toInt(maj), min: toInt(min), pat: toInt(pat), pre };
}

/** Compare two semvers: returns -1, 0, 1 */
function cmpSemver(a: unknown, b: unknown): number {
  const A = parseSemver(a), B = parseSemver(b);
  if (!A || !B) return 0;
  if (A.maj !== B.maj) return A.maj < B.maj ? -1 : 1;
  if (A.min !== B.min) return A.min < B.min ? -1 : 1;
  if (A.pat !== B.pat) return A.pat < B.pat ? -1 : 1;
  // Treat pre-release as lower than stable
  const aPre = A.pre && A.pre.length > 0;
  const bPre = B.pre && B.pre.length > 0;
  if (aPre !== bPre) return aPre ? -1 : 1;
  if (aPre && bPre) return A.pre < B.pre ? -1 : (A.pre > B.pre ? 1 : 0);
  return 0;
}

/** Check current >= minimum (major.minor.patch). */
export function isVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  return cmpSemver(current, minimum) >= 0;
}

/**
 * Check support against your policy.
 */
export function checkSupport(policy: SupportPolicy = {}): SupportCheckResult {
  const info = detectRuntime();

  const fail = (reason: string): SupportCheckResult => ({
    ok: false,
    info,
    reason,
  });
  const pass = (): SupportCheckResult => ({ ok: true, info });

  const hasGlobalPath = (path: string): boolean => {
    const parts = path.split(".");
    let cur: any = getRuntimeGlobal();
    for (const p of parts) {
      if (cur == null || !(p in cur)) return false;
      cur = cur[p];
    }
    return true;
  };

  if (info.runtime === "node" && policy.node) {
    if (!info.version || !isVersionAtLeast(info.version, policy.node)) {
      return fail(
        `Requires Node >= ${policy.node}, found ${info.version ?? "unknown"}.`,
      );
    }
    return pass();
  }
  if (info.runtime === "deno" && policy.deno) {
    if (!info.version || !isVersionAtLeast(info.version, policy.deno)) {
      return fail(
        `Requires Deno >= ${policy.deno}, found ${info.version ?? "unknown"}.`,
      );
    }
    return pass();
  }
  if (info.runtime === "bun" && policy.bun) {
    if (!info.version || !isVersionAtLeast(info.version, policy.bun)) {
      return fail(
        `Requires Bun >= ${policy.bun}, found ${info.version ?? "unknown"}.`,
      );
    }
    return pass();
  }
  if (info.runtime === "cloudflare") {
    const feats = policy.cloudflare?.requireFeatures ?? [];
    for (const f of feats) {
      if (!hasGlobalPath(f)) {
        return fail(`Cloudflare Workers missing required feature: ${f}`);
      }
    }
    return pass();
  }
  return fail("Unsupported runtime.");
}

/** Throw an Error if current runtime/version is unsupported. */
export function assertSupported(policy: SupportPolicy): void {
  const res = checkSupport(policy);
  if (!res.ok) {
    const { runtime, version } = res.info;
    throw new Error(
      `Unsupported environment: ${res.reason} (runtime=${runtime}, version=${version})`,
    );
  }
}
