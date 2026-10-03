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

if (import.meta.main) {
  const [logPath, ...fixturePaths] = Deno.args;
  if (!logPath) {
    throw new Error("Expected the recache log path and changed fixtures");
  }

  let rateLimited = hasRateLimitLog(await Deno.readTextFile(logPath));
  for (const path of fixturePaths) {
    const fixture: unknown = JSON.parse(await Deno.readTextFile(path));
    if (isRateLimitedFixture(fixture)) {
      console.error(`HTTP 429 recorded in ${path}`);
      rateLimited = true;
    }
  }

  if (rateLimited) {
    console.error(
      "Yahoo rate-limited the recache run; do not commit or push fixtures.",
    );
    Deno.exit(1);
  }
}
