import { readFile } from "node:fs/promises";
import { readFixtureBytes } from "./recache-fixtures.ts";

/** Reject rate-limited recache runs before any fixtures are staged or pushed. */
export function hasRateLimitLog(log: string): boolean {
  // ANSI color codes can appear between "status" and its numeric value.
  // deno-lint-ignore no-control-regex
  const plain = log.replace(/\x1b\[[0-9;]*m/g, "");
  return /\b(?:status(?:Code)?[\s":=]*429|HTTP(?:\/\S+)?\s+429|Too Many Requests)\b/i
    .test(plain);
}

export function isRateLimitedFixture(fixture: unknown): boolean {
  return typeof fixture === "object" && fixture !== null &&
    "response" in fixture && typeof fixture.response === "object" &&
    fixture.response !== null && "status" in fixture.response &&
    fixture.response.status === 429;
}

/** Transient/error payloads must never replace an otherwise successful capture. */
export function fixtureRejectionReason(
  fixture: unknown,
  authFlow = false,
): string | undefined {
  if (
    !fixture || typeof fixture !== "object" || !("response" in fixture) ||
    !fixture.response || typeof fixture.response !== "object"
  ) return "invalid-response";
  const response = fixture.response as Record<string, unknown>;
  const status = response.status;
  if (
    typeof status !== "number" || !Number.isInteger(status) || status < 100 ||
    status > 599
  ) return "invalid-status";
  if (status === 429) return "rate-limit";
  if (status === 408) return "timeout";
  if (status >= 500) return "server-error";
  if (response.ok === false && status >= 200 && status < 300) return "inconsistent-status";
  const headers = response.headers && typeof response.headers === "object"
    ? response.headers as Record<string, unknown>
    : {};
  const location = Object.entries(headers).find(([name]) =>
    name.toLowerCase() === "location"
  )?.[1];
  if (
    !authFlow && typeof location === "string" &&
    /(?:guce|consent)\.yahoo\.com/i.test(location)
  ) return "consent-interstitial";
  const body = typeof response.bodyText === "string" ? response.bodyText : "";
  if (!authFlow && /^\s*(?:<!doctype\s+html|<html\b)/i.test(body)) return "html-interstitial";
  let json = response.bodyJson;
  if (!json && /^[\s]*[\[{]/.test(body)) {
    try {
      json = JSON.parse(body);
    } catch {
      return "invalid-json-body";
    }
  }
  let message = body;
  if (json && typeof json === "object") {
    const object = json as Record<string, unknown>;
    const errors: unknown[] = [object.error];
    // The library accepts any immediate API envelope with an `error` member.
    // Inspect only error slots, never legitimate data fields such as names.
    for (const value of Object.values(object)) {
      if (value && typeof value === "object" && "error" in value) {
        errors.push(value.error);
      }
    }
    message = errors.filter((error) => error !== undefined && error !== null)
      .map((error) => JSON.stringify(error)).join(" ");
  }
  if (/too many requests|rate.?limit(?:ed| exceeded)?/i.test(message)) {
    return "rate-limit-payload";
  }
  if (/timed?\s*out|timeout/i.test(message)) return "timeout-payload";
  if (/service[\s_-]*unavailable|temporar(?:y|ily)[\s_-]*unavailable|bad[\s_-]*gateway|internal[\s_-]*server[\s_-]*error/i.test(message)) {
    return "upstream-error-payload";
  }
  if (!authFlow && /consent required|consent interstitial/i.test(message)) {
    return "consent-interstitial";
  }
  return undefined;
}

export async function rateLimitGuardMain(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: bun scripts/check-recache-rate-limits.ts LOG [CHANGED_FIXTURE ...]");
    return 0;
  }
  if (!args.length || args.some((arg) => arg.startsWith("--"))) {
    console.error("Expected a log path and optional changed fixture paths");
    return 2;
  }
  try {
    const [logPath, ...paths] = args;
    let rejected = hasRateLimitLog(await readFile(logPath, "utf8"));
    for (const path of paths) {
      let fixture: unknown;
      try {
        fixture = JSON.parse((await readFixtureBytes(path, true)).toString("utf8"));
      } catch {
        console.error("Changed fixture is not safe, regular JSON");
        return 1;
      }
      const reason = fixtureRejectionReason(fixture);
      if (reason) {
        rejected = true;
        console.error(`Changed fixture rejected: ${reason}`);
      }
    }
    if (rejected) {
      console.error("Recache guard rejected transient responses; do not stage or push captures");
      return 1;
    }
    return 0;
  } catch {
    console.error("Recache guard could not read its inputs safely");
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await rateLimitGuardMain(process.argv.slice(2));
}
