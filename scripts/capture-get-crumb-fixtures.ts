import { parseArgs } from "@std/cli/parse-args";

const FIXTURE_DIR = "tests/fixtures/http";
const PROFILE_PATTERN = /^([a-z]{2})-([0-9]{8})(?:-[a-z0-9]+)*$/;
const TRACE_PREFIX = "GET_CRUMB_TRACE=";

type HeaderValue = string | string[];

interface FetchFixture {
  request: {
    url: string;
    method?: string;
    headers?: Record<string, HeaderValue>;
    [key: string]: unknown;
  };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    headers?: Record<string, HeaderValue>;
    bodyText?: string;
    bodyJson?: unknown;
    bodyBase64?: string;
    body?: unknown;
    [key: string]: unknown;
  };
}

interface TraceEntry {
  method: string;
  host: string;
  path: string;
}

export function normalizeCountryCode(country: string): string {
  if (!/^[a-z]{2}$/i.test(country)) {
    throw new Error("--country must be an ISO alpha-2 country code");
  }
  return country.toUpperCase();
}

export function defaultProfileId(
  countryCode: string,
  now = new Date(),
): string {
  return countryCode.toLowerCase() + "-" +
    now.toISOString().slice(0, 10).replaceAll("-", "");
}

export function validateProfileId(
  profile: string,
  countryCode?: string,
): string {
  const match = profile.match(PROFILE_PATTERN);
  if (!match) {
    throw new Error(
      "profile must look like gb-20260808 or gb-20260808-variant",
    );
  }

  const [, profileCountry, compactDate] = match;
  if (
    countryCode &&
    profileCountry !== normalizeCountryCode(countryCode).toLowerCase()
  ) {
    throw new Error("profile country must match --country");
  }

  const year = compactDate.slice(0, 4);
  const month = compactDate.slice(4, 6);
  const day = compactDate.slice(6, 8);
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
  ) {
    throw new Error("profile contains an invalid capture date");
  }

  return profile;
}

export function geoFixtureId(profile: string, id: string): string {
  validateProfileId(profile);
  if (!id.startsWith("getCrumb-")) {
    throw new Error(`Unexpected getCrumb fixture id: ${id}`);
  }
  return `getCrumb-geo-${profile}-${id.slice("getCrumb-".length)}`;
}

function filteredHeaders(
  headers: Record<string, HeaderValue> | undefined,
  allowed: ReadonlySet<string>,
): Record<string, HeaderValue> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase())),
  );
}

export function compactFixture(
  filename: string,
  fixture: FetchFixture,
): FetchFixture {
  const compacted = structuredClone(fixture);
  const sensitiveRequestHeaders = new Set([
    "authorization",
    "cookie",
    "proxy-authorization",
    "x-api-key",
  ]);

  if (compacted.request.headers) {
    compacted.request.headers = Object.fromEntries(
      Object.entries(compacted.request.headers).filter(
        ([name]) => !sensitiveRequestHeaders.has(name.toLowerCase()),
      ),
    );
  }

  compacted.response.headers = filteredHeaders(
    compacted.response.headers,
    new Set(["content-type", "location", "set-cookie"]),
  );

  const originalBody = compacted.response.bodyText;
  delete compacted.response.bodyJson;
  delete compacted.response.bodyBase64;
  delete compacted.response.body;

  if (filename.endsWith("-getcrumb.json")) {
    if (typeof originalBody !== "string" || originalBody.length === 0) {
      throw new Error(`Crumb fixture has an empty body: ${filename}`);
    }
    compacted.response.bodyText = originalBody;
  } else if (filename.endsWith("-collectConsent.html.json")) {
    if (typeof originalBody !== "string") {
      throw new Error(`Consent fixture has no text body: ${filename}`);
    }
    const inputs = [
      ...originalBody.matchAll(
        /<input type="hidden" name="[^"]+" value="[^"]+">/g,
      ),
    ].map(([input]) => input);
    if (inputs.length === 0) {
      throw new Error(`Consent fixture has no hidden inputs: ${filename}`);
    }
    compacted.response.bodyText = inputs.join("\n");
  } else {
    compacted.response.bodyText = "";
  }

  return compacted;
}

async function profileFixturePaths(profile: string): Promise<string[]> {
  const prefix = `getCrumb-geo-${profile}-`;
  const paths: string[] = [];
  for await (const entry of Deno.readDir(FIXTURE_DIR)) {
    if (
      entry.isFile && entry.name.startsWith(prefix) &&
      entry.name.endsWith(".json")
    ) {
      paths.push(`${FIXTURE_DIR}/${entry.name}`);
    }
  }
  return paths.sort();
}

async function runGeoTest(
  profile: string,
  mode: "record" | "replay",
): Promise<{ success: boolean; output: string; trace?: TraceEntry[] }> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "task",
      "test:serial",
      "src/lib/getCrumb.geo.test.ts",
    ],
    env: {
      FETCH_DEVEL_GETCRUMB_PROFILE: profile,
      FETCH_DEVEL_GETCRUMB_MODE: mode,
    },
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  const output = new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  const traceLine = output.split("\n").find((line) =>
    line.includes(TRACE_PREFIX)
  );
  let trace: TraceEntry[] | undefined;
  if (traceLine) {
    const json = traceLine.slice(
      traceLine.indexOf(TRACE_PREFIX) + TRACE_PREFIX.length,
    );
    trace = JSON.parse(json);
  }
  return { success: result.success, output, trace };
}

async function compactProfileFixtures(paths: string[]): Promise<void> {
  const compacted = await Promise.all(paths.map(async (path) => {
    const fixture = JSON.parse(await Deno.readTextFile(path)) as FetchFixture;
    const filename = path.slice(path.lastIndexOf("/") + 1);
    return { path, fixture: compactFixture(filename, fixture) };
  }));

  await Promise.all(
    compacted.map(({ path, fixture }) =>
      Deno.writeTextFile(path, JSON.stringify(fixture, null, 2))
    ),
  );
}

function usage(): string {
  return `Usage:
  deno task fixtures:capture:getcrumb --country <CC> [--profile <id>]

Examples:
  deno task fixtures:capture:getcrumb --country GB
  deno task fixtures:capture:getcrumb --country DE --profile de-20260808-consent

Connect to and independently verify the requested VPN country before running.`;
}

async function main(args: string[]): Promise<void> {
  const flags = parseArgs(args, {
    string: ["country", "profile"],
    boolean: ["help"],
    alias: { h: "help" },
  });

  if (flags.help) {
    console.log(usage());
    return;
  }
  if (flags._.length > 0 || !flags.country) {
    throw new Error(usage());
  }

  const countryCode = normalizeCountryCode(flags.country);
  const profile = validateProfileId(
    flags.profile ?? defaultProfileId(countryCode),
    countryCode,
  );
  const existingPaths = await profileFixturePaths(profile);
  if (existingPaths.length > 0) {
    throw new Error(
      `Profile ${profile} already has fixtures; choose a new dated or suffixed profile`,
    );
  }

  console.log(
    `Capturing ${profile}. Confirm your VPN exit country is ${countryCode} before continuing.`,
  );
  const recorded = await runGeoTest(profile, "record");
  console.log(recorded.output);

  const paths = await profileFixturePaths(profile);
  if (!recorded.success || !recorded.trace) {
    throw new Error(
      `Recording failed. Inspect the generated files before retrying: ${
        paths.join(", ") || "none"
      }`,
    );
  }

  const requiredNames = [
    `getCrumb-geo-${profile}-quote-AAPL.json`,
    `getCrumb-geo-${profile}-getcrumb.json`,
  ];
  for (const name of requiredNames) {
    if (!paths.includes(`${FIXTURE_DIR}/${name}`)) {
      throw new Error(`Recording did not create required fixture ${name}`);
    }
  }

  await compactProfileFixtures(paths);

  const replayed = await runGeoTest(profile, "replay");
  console.log(replayed.output);
  if (!replayed.success) {
    throw new Error(
      `Compacted profile ${profile} did not replay; leave it unregistered for inspection`,
    );
  }

  console.log("Capture and compacted replay succeeded.");
  console.log("Add this reviewed profile to COMMITTED_PROFILES:");
  console.log(JSON.stringify(
    {
      profile,
      countryCode,
      capturedAt: profile.slice(3, 7) + "-" + profile.slice(7, 9) + "-" +
        profile.slice(9, 11),
      expectedTrace: recorded.trace,
    },
    null,
    2,
  ));
  console.log("Generated fixtures:");
  for (const path of paths) console.log(`- ${path}`);
}

if (import.meta.main) {
  try {
    await main(Deno.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
