import { mkdtemp, writeFile, rm, symlink, link } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import {
  fixtureRejectionReason,
  hasRateLimitLog,
  isRateLimitedFixture,
} from "./check-recache-rate-limits.ts";

test("recache guard catches rate limits in logs even without a written fixture", () => {
  for (
    const log of [
      "Failed to get crumb, status 429, statusText: Too Many Requests",
      "HTTPError: HTTP 429",
      '{"status":429}',
      "status \x1b[31m429\x1b[0m",
      "Too Many Requests",
    ]
  ) {
    expect(hasRateLimitLog(log)).toBe(true);
  }
});

test("recache guard permits schema drift and unrelated numbers", () => {
  for (
    const log of [
      "Failed Yahoo Schema validation",
      "regularMarketPrice: 429.5",
      "429 tests failed",
      "No data found, status 404",
      "status 4290",
    ]
  ) {
    expect(hasRateLimitLog(log)).toBe(false);
  }
});

test("recache guard catches a cached 429 even if the log omits it", () => {
  expect(isRateLimitedFixture({ response: { status: 429 } })).toBe(true);
  expect(isRateLimitedFixture({ response: { status: 200 } })).toBe(false);
  expect(isRateLimitedFixture({ response: { status: 404 } })).toBe(false);
  expect(isRateLimitedFixture(null)).toBe(false);
});


test("capture validation rejects transient responses before accepting shape drift", () => {
  const fixture = (status: number, bodyText = "", headers = {}) => ({
    response: { status, ok: status >= 200 && status < 300, bodyText, headers },
  });
  for (const status of [429, 408, 500, 502, 503, 599]) {
    expect(fixtureRejectionReason(fixture(status))).toBeDefined();
  }
  expect(fixtureRejectionReason(fixture(200, "<!doctype html><html>Consent</html>")))
    .toBe("html-interstitial");
  expect(fixtureRejectionReason(fixture(302, "", { Location: "https://consent.yahoo.com/v2" })))
    .toBe("consent-interstitial");
  expect(fixtureRejectionReason(fixture(200, '{"finance":{"error":{"description":"Request timed out"}}}')))
    .toBe("timeout-payload");
  expect(fixtureRejectionReason(fixture(200, '{"error":{"description":"Service unavailable"}}')))
    .toBe("upstream-error-payload");
  expect(fixtureRejectionReason(fixture(200, '{"chart":{"error":{"code":"Too Many Requests"}}}')))
    .toBe("rate-limit-payload");
  expect(fixtureRejectionReason(fixture(200, '{"quoteResponse":{"error":{"code":"Too Many Requests"}}}')))
    .toBe("rate-limit-payload");
  expect(fixtureRejectionReason(fixture(200, '{"timeseries":{"error":{"description":"Request timed out"}}}')))
    .toBe("timeout-payload");
  for (const code of ["Internal Server Error", "InternalServerError", "ServiceUnavailable", "BadGateway"]) {
    expect(fixtureRejectionReason(fixture(200, JSON.stringify({ finance: { error: { code } } }))))
      .toBe("upstream-error-payload");
  }
  expect(fixtureRejectionReason(fixture(200, '{"futureEnvelope":{"error":{"code":"Too Many Requests"}}}')))
    .toBe("rate-limit-payload");
  expect(fixtureRejectionReason(fixture(200, '{"futureEnvelope":{"result":[{"name":"Internal Server Error","error":"Timeout Holdings"}]}}')))
    .toBeUndefined();
  expect(fixtureRejectionReason(fixture(200, '{"broken":'))).toBe("invalid-json-body");
  expect(fixtureRejectionReason(fixture(200, '{"quoteResponse":{"result":[{"longName":"Timeout Holdings","newField":42}]}}')))
    .toBeUndefined();
  expect(fixtureRejectionReason(fixture(404, '{"finance":{"error":{"description":"Not Found"}}}')))
    .toBeUndefined();
  expect(fixtureRejectionReason(fixture(200, "<html>Consent flow</html>"), true))
    .toBeUndefined();
});

test("rate-limit CLI rejects unsafe/transient inputs without logging session payloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-capture-check-"));
  const command = fileURLToPath(new URL("./check-recache-rate-limits.ts", import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [command, ...args], {
    encoding: "utf8", timeout: 5000,
  });
  try {
    const log = join(root, "capture.log");
    const fixture = join(root, "capture.json");
    await writeFile(log, "schema drift");
    await writeFile(fixture, JSON.stringify({ response: {
      status: 200, ok: true, bodyJson: { result: [] },
    } }));
    expect(run(log, fixture).status).toBe(0);
    expect(run("--help").status).toBe(0);
    expect(run().status).toBe(2);
    expect(run("--unknown").status).toBe(2);
    await writeFile(fixture, JSON.stringify({ response: {
      status: 503, bodyText: "PRIVATE_SESSION_COOKIE_CRUMB_SENTINEL",
    } }));
    let result = run(log, fixture);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("server-error");
    expect(result.stderr + result.stdout).not.toContain("PRIVATE_SESSION");
    await writeFile(fixture, "PRIVATE_SESSION_COOKIE_CRUMB_SENTINEL");
    result = run(log, fixture);
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).not.toContain("PRIVATE_SESSION");
    await symlink(fixture, join(root, "alias.json"));
    expect(run(log, join(root, "alias.json")).status).toBe(1);
    await link(fixture, join(root, "hardlink.json"));
    expect(run(log, fixture).status).toBe(1);
    await writeFile(log, "HTTP 429");
    expect(run(log).status).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
