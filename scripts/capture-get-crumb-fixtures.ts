import { mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureHosts,
  createCaptureBroker,
  type CaptureTransport,
} from "./recache/broker.ts";
import { runCaptureChild } from "./recache/child.ts";
import { replayBaseline } from "./recache/orchestrator.ts";
import {
  publishStage,
  stageFixtures,
  type FixtureStage,
} from "./recache/staging.ts";
import { readFixtureBytes, snapshotFixtures } from "./recache-fixtures.ts";
import { fixtureRejectionReason } from "./check-recache-rate-limits.ts";

const FIXTURE_DIR = "tests/fixtures/http";
const PROFILE_PATTERN = /^([a-z]{2})-([0-9]{8})(?:-[a-z0-9]+)*$/;

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
  return (
    countryCode.toLowerCase() +
    "-" +
    now.toISOString().slice(0, 10).replaceAll("-", "")
  );
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

const repository = fileURLToPath(new URL("../", import.meta.url));
const geoTest = "src/lib/getCrumb.geo.test.ts";
const baselineFiles = ["src/lib/getCrumb.test.ts", geoTest];
const routes = new Set([
  "GET finance.yahoo.com /quote/AAPL",
  "GET guce.yahoo.com /consent",
  "GET guce.yahoo.com /copyConsent",
  "GET consent.yahoo.com /v2/collectConsent",
  "POST consent.yahoo.com /v2/collectConsent",
  "GET query1.finance.yahoo.com /v1/test/getcrumb",
]);
// _getCrumb bounds consent recursion at depth five. Keep ids limited to its
// actual step names, including the final redirect entering depth six.
function fixtureRoute(suffix: string): string | undefined {
  if (suffix === "getcrumb")
    return "GET query1.finance.yahoo.com /v1/test/getcrumb";
  if (
    suffix === "quote-AAPL" ||
    /^quote-AAPL-(?:depth-[2-6]-)?consent-final-redirect\.html$/.test(suffix)
  ) {
    return "GET finance.yahoo.com /quote/AAPL";
  }
  const step = suffix.match(
    /^quote-AAPL-(?:depth-[1-5]-)?(consent\.html|collectConsent\.html|collectConsentSubmit|copyConsent)$/,
  )?.[1];
  if (step === "consent.html") return "GET guce.yahoo.com /consent";
  if (step === "collectConsent.html")
    return "GET consent.yahoo.com /v2/collectConsent";
  if (step === "collectConsentSubmit")
    return "POST consent.yahoo.com /v2/collectConsent";
  if (step === "copyConsent") return "GET guce.yahoo.com /copyConsent";
}

function traceRequest(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): TraceEntry {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const entry = {
    method: request.method,
    host: url.hostname,
    path: url.pathname,
  };
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !captureHosts.has(url.hostname) ||
    !routes.has(`${entry.method} ${entry.host} ${entry.path}`)
  ) {
    throw new Error("Unexpected country capture request");
  }
  return entry;
}

/** Reject untrusted child metadata without emitting URLs, headers or payloads. */
export function validateTrace(value: unknown): TraceEntry[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 64) {
    throw new Error("Invalid country capture trace");
  }
  return value.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Object.keys(entry).sort().join() !== "host,method,path"
    ) {
      throw new Error("Invalid country capture trace");
    }
    const { method, host, path } = entry as TraceEntry;
    if (
      typeof method !== "string" ||
      typeof host !== "string" ||
      typeof path !== "string" ||
      !routes.has(`${method} ${host} ${path}`)
    )
      throw new Error("Unexpected country capture trace");
    return { method, host, path };
  });
}

interface CountryOptions {
  country: string;
  profile: string;
  live: boolean;
  help: boolean;
  interval: number;
  runTimeout: number;
}

export function parseCountryArguments(args: string[]): CountryOptions {
  let country = "";
  let profile: string | undefined;
  let live = false;
  let help = false;
  let runTimeout = 120000;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const [flag, ...suffix] = args[index].split("=");
    const name = flag === "-h" ? "--help" : flag;
    if (seen.has(name)) throw new Error("Duplicate country capture option");
    seen.add(name);
    if (name === "--live" || name === "--help") {
      if (suffix.length)
        throw new Error("Unexpected country capture option value");
      if (name === "--live") live = true;
      else help = true;
    } else if (["--country", "--profile", "--run-timeout"].includes(name)) {
      const value = suffix.length ? suffix.join("=") : args[++index];
      if (!value || value.startsWith("--"))
        throw new Error("Missing country capture option value");
      if (name === "--country") country = normalizeCountryCode(value);
      if (name === "--profile") profile = value;
      if (name === "--run-timeout") {
        runTimeout = Number(value);
        if (
          !Number.isInteger(runTimeout) ||
          runTimeout <= 0 ||
          runTimeout > 2147483647
        ) {
          throw new Error("--run-timeout must be a positive bounded integer");
        }
      }
    } else throw new Error("Unknown country capture option or extra argument");
  }
  if (!help && !country) throw new Error("--country is required");
  const interval = Number(process.env.FETCH_DEVEL_RECACHE_INTERVAL ?? "3000");
  if (!Number.isFinite(interval) || interval < 0 || interval > 2147483647) {
    throw new Error(
      "FETCH_DEVEL_RECACHE_INTERVAL must be a bounded nonnegative number",
    );
  }
  return {
    country,
    profile: help
      ? ""
      : validateProfileId(profile ?? defaultProfileId(country), country),
    live,
    help,
    interval,
    runTimeout,
  };
}

const usage =
  "Usage: FETCH_DEVEL=recache bun scripts/capture-get-crumb-fixtures.ts --live --country CC [--profile id] [--run-timeout MS]\nConnect to and independently verify the requested VPN country before running.";

/** Internal test seams never become CLI flags or environment root overrides. */
export interface CountryDependencies {
  root?: string;
  transport?: CaptureTransport;
  signal?: AbortSignal;
  log?: (message: string) => void;
}

// A physical request may reuse a fixture id. Preserve every observed canonical
// request for that id, while authorizing exactly one staged filename per id.
// Session-bearing URLs stay private and never enter diagnostics or trace output.
type ObservedFixtures = Map<string, Set<string>>;

function captureFilename(profile: string, id: string | undefined): string {
  if (typeof id !== "string")
    throw new Error("Country request has no fixture id");
  const normalized = id.replace(/\.json$/, "");
  const suffix = normalized.slice("getCrumb-".length);
  if (!normalized.startsWith("getCrumb-") || !fixtureRoute(suffix)) {
    throw new Error("Unexpected country capture fixture id");
  }
  return geoFixtureId(profile, normalized) + ".json";
}

async function validateStage(
  stage: FixtureStage,
  profile: string,
  observed: ObservedFixtures,
): Promise<string[]> {
  const after = await snapshotFixtures(stage.fixtureRoot);
  for (const [path, hash] of stage.baseline) {
    if (after.get(path) !== hash)
      throw new Error("Country capture changed an earlier fixture");
  }
  const prefix = `getCrumb-geo-${profile}-`;
  const paths: string[] = [];
  // Inspect directory entries as well as the JSON snapshot: symlinks, nonregular
  // entries and unexpected non-JSON output must not disappear from validation.
  for (const entry of await readdir(stage.fixtureRoot, {
    withFileTypes: true,
  })) {
    const path = join(stage.fixtureRoot, entry.name);
    if (stage.baseline.has(path)) continue;
    if (
      !entry.isFile() ||
      !entry.name.startsWith(prefix) ||
      !entry.name.endsWith(".json") ||
      !fixtureRoute(entry.name.slice(prefix.length, -5)) ||
      !observed.has(entry.name)
    )
      throw new Error("Unexpected country fixture output");
    const bytes = await readFixtureBytes(path, true);
    const fixture = JSON.parse(bytes.toString("utf8")) as FetchFixture;
    const request = new Request(fixture.request.url, {
      method: fixture.request.method ?? "GET",
    });
    const entryTrace = traceRequest(request);
    if (!observed.get(entry.name)!.has(`${request.method} ${request.url}`)) {
      throw new Error("Country fixture request was not observed for its id");
    }
    if (
      `${entryTrace.method} ${entryTrace.host} ${entryTrace.path}` !==
      fixtureRoute(entry.name.slice(prefix.length, -5))
    ) {
      throw new Error("Country fixture route does not match its id");
    }
    const locations = Object.entries(fixture.response.headers ?? {}).filter(
      ([name]) => name.toLowerCase() === "location",
    );
    for (const [, value] of locations) {
      if (typeof value !== "string")
        throw new Error("Invalid country fixture redirect");
      traceRequest(new URL(value, fixture.request.url).href);
    }
    if (fixtureRejectionReason(fixture, true))
      throw new Error("Rejected country fixture response");
    paths.push(path);
  }
  if (paths.length !== observed.size)
    throw new Error("Country capture is missing an observed fixture");
  for (const suffix of ["quote-AAPL", "getcrumb"]) {
    if (!paths.includes(join(stage.fixtureRoot, prefix + suffix + ".json"))) {
      throw new Error("Country capture is missing a required fixture");
    }
  }
  return paths.sort();
}

async function runCountry(
  options: CountryOptions,
  dependencies: CountryDependencies,
): Promise<number> {
  const log = dependencies.log ?? console.log;
  if (options.help) {
    log(usage);
    return 0;
  }
  if (!options.live || process.env.FETCH_DEVEL !== "recache") {
    log(
      "Country capture requires FETCH_DEVEL=recache and explicit --live opt-in",
    );
    return 2;
  }
  const signal = dependencies.signal ?? new AbortController().signal;
  const root = await realpath(dependencies.root ?? repository);
  const fixtureRoot = join(root, FIXTURE_DIR);
  const prefix = `getCrumb-geo-${options.profile}-`;
  if ((await readdir(fixtureRoot)).some((name) => name.startsWith(prefix))) {
    log("Profile already exists; choose a new dated or suffixed profile");
    return 2;
  }
  log("Country capture replay-only baseline");
  if (
    !(await replayBaseline(root, baselineFiles, signal, options.runTimeout))
  ) {
    log("Country capture aborted: replay-only baseline failed");
    return 1;
  }
  const temporary = await realpath(tmpdir());
  if (temporary === root || temporary.startsWith(root + sep))
    throw new Error("Capture TMPDIR overlaps repository");
  const scratch = await mkdtemp(join(temporary, "yf-country-capture-"));
  try {
    if (root.startsWith(scratch + sep) || scratch.startsWith(root + sep))
      throw new Error("Capture scratch overlaps repository");
    const stage = await stageFixtures(fixtureRoot, scratch);
    const observed: TraceEntry[] = [];
    const observedFixtures: ObservedFixtures = new Map();
    const transport = dependencies.transport ?? globalThis.fetch;
    const broker = await createCaptureBroker(
      join(scratch, "broker.sock"),
      async (input, init, id) => {
        if (observed.length >= 64)
          throw new Error("Country capture trace limit exceeded");
        const request = new Request(input, init);
        const entry = traceRequest(request);
        const filename = captureFilename(options.profile, id);
        const suffix = filename.slice(prefix.length, -5);
        if (
          `${entry.method} ${entry.host} ${entry.path}` !== fixtureRoute(suffix)
        ) {
          throw new Error(
            "Country request route does not match its fixture id",
          );
        }
        const requests = observedFixtures.get(filename) ?? new Set<string>();
        requests.add(`${request.method} ${request.url}`);
        observedFixtures.set(filename, requests);
        observed.push(entry);
        return transport(input, init, id);
      },
      undefined,
      options.interval,
    );
    try {
      log(
        `Recording ${options.profile}; independently verify VPN exit country ${options.country}.`,
      );
      const recorded = await runCaptureChild(
        root,
        scratch,
        join(root, geoTest),
        {
          fixtureRoot: stage.fixtureRoot,
          mode: "geo-record",
          profile: options.profile,
          interval: options.interval,
        },
        broker,
        signal,
        options.runTimeout,
      );
      if (recorded.code !== 0 || broker.rateLimited || signal.aborted)
        throw new Error("Country recording failed");
      const trace = validateTrace(recorded.trace);
      if (JSON.stringify(trace) !== JSON.stringify(observed))
        throw new Error("Country recording trace mismatch");
      const paths = await validateStage(
        stage,
        options.profile,
        observedFixtures,
      );
      const compacted = await Promise.all(
        paths.map(async (path) => ({
          path,
          fixture: compactFixture(
            basename(path),
            JSON.parse((await readFixtureBytes(path, true)).toString("utf8")),
          ),
        })),
      );
      for (const { path, fixture } of compacted)
        await writeFile(path, JSON.stringify(fixture, null, 2), {
          mode: 0o600,
        });
      await validateStage(stage, options.profile, observedFixtures);
      const compactedSnapshot = await snapshotFixtures(stage.fixtureRoot);
      const replayed = await runCaptureChild(
        root,
        scratch,
        join(root, geoTest),
        {
          fixtureRoot: stage.fixtureRoot,
          mode: "geo-replay",
          profile: options.profile,
          interval: 0,
        },
        broker,
        signal,
        options.runTimeout,
      );
      if (
        replayed.code !== 0 ||
        signal.aborted ||
        JSON.stringify(validateTrace(replayed.trace)) !==
          JSON.stringify(trace) ||
        observed.length !== trace.length
      )
        throw new Error("Compacted country profile replay failed");
      const replaySnapshot = await snapshotFixtures(stage.fixtureRoot);
      if (
        JSON.stringify([...replaySnapshot]) !==
        JSON.stringify([...compactedSnapshot])
      )
        throw new Error("Replay changed staged fixtures");
      await validateStage(stage, options.profile, observedFixtures);
      if (signal.aborted) throw new Error("Country capture interrupted");
      const published = await publishStage(stage, options.profile);
      if (published.rejected.length || published.published !== paths.length)
        throw new Error("Country publication refused");
      log(
        "Capture and compacted replay succeeded. Review fixtures before registering this profile:",
      );
      log(
        JSON.stringify(
          {
            profile: options.profile,
            countryCode: options.country,
            capturedAt: `${options.profile.slice(3, 7)}-${options.profile.slice(7, 9)}-${options.profile.slice(9, 11)}`,
            expectedTrace: trace,
          },
          null,
          2,
        ),
      );
      log(`Validated country fixtures published: ${published.published}.`);
      return 0;
    } finally {
      await broker.close();
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function main(
  args: string[],
  dependencies: CountryDependencies = {},
): Promise<number> {
  let options: CountryOptions;
  const log = dependencies.log ?? console.log;
  try {
    options = parseCountryArguments(args);
  } catch {
    log("Invalid country capture arguments. " + usage);
    return 2;
  }
  const controller = new AbortController();
  let exitCode = 0;
  const interrupt = () => {
    exitCode = 130;
    controller.abort();
  };
  const terminate = () => {
    exitCode = 143;
    controller.abort();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    const code = await runCountry(options, {
      ...dependencies,
      signal: dependencies.signal ?? controller.signal,
    });
    return exitCode || code;
  } catch {
    log(
      "Country capture failed; private staging discarded. No profile was registered.",
    );
    return exitCode || 1;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
