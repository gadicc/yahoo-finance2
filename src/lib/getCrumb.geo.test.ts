import {
  describe,
  expect,
  fetchDevel,
  it,
  setupCache,
  spy,
  spyLogger,
} from "../../tests/common.ts";
import {
  geoFixtureId,
  validateProfileId,
} from "../../scripts/capture-get-crumb-fixtures.ts";
import { ExtendedCookieJar } from "./cookieJar.ts";
import { _getCrumb } from "./getCrumb.ts";
import defaultOptions from "./options/defaults.ts";

interface TraceEntry {
  method: string;
  host: string;
  path: string;
}

interface GeoProfile {
  profile: string;
  countryCode: string;
  capturedAt: string;
  expectedTrace: TraceEntry[];
}

// Country captures are deliberately registered only after record, review,
// compaction, and replay succeeds. The capture command prints the entry to add.
const COMMITTED_PROFILES: GeoProfile[] = [{
  profile: "nl-20260809",
  countryCode: "NL",
  capturedAt: "2026-08-09",
  expectedTrace: [
    { method: "GET", host: "finance.yahoo.com", path: "/quote/AAPL" },
    { method: "GET", host: "guce.yahoo.com", path: "/consent" },
    { method: "GET", host: "finance.yahoo.com", path: "/quote/AAPL" },
    { method: "GET", host: "guce.yahoo.com", path: "/consent" },
    { method: "GET", host: "finance.yahoo.com", path: "/quote/AAPL" },
    { method: "GET", host: "guce.yahoo.com", path: "/consent" },
    { method: "GET", host: "finance.yahoo.com", path: "/quote/AAPL" },
    {
      method: "GET",
      host: "query1.finance.yahoo.com",
      path: "/v1/test/getcrumb",
    },
  ],
}];

const captureProfile = Deno.env.get("FETCH_DEVEL_GETCRUMB_PROFILE");
const captureMode = Deno.env.get("FETCH_DEVEL_GETCRUMB_MODE");

function traceEntry(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): TraceEntry {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input));
  return {
    method: init?.method ?? request?.method ?? "GET",
    host: url.hostname,
    path: url.pathname,
  };
}

describe("getCrumb geographic fixtures", () => {
  setupCache();

  it("has valid committed profile metadata", () => {
    for (const profile of COMMITTED_PROFILES) {
      expect(validateProfileId(profile.profile, profile.countryCode)).toBe(
        profile.profile,
      );
      expect(profile.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(profile.expectedTrace.length).toBeGreaterThan(1);
    }
  });

  let profiles: Array<GeoProfile & { mode: "record" | "replay" }>;
  if (captureProfile) {
    validateProfileId(captureProfile);
    if (captureMode !== "record" && captureMode !== "replay") {
      throw new Error(
        "FETCH_DEVEL_GETCRUMB_MODE must be record or replay when a profile is selected",
      );
    }
    profiles = [{
      profile: captureProfile,
      countryCode: captureProfile.slice(0, 2).toUpperCase(),
      capturedAt: captureProfile.slice(3, 7) + "-" +
        captureProfile.slice(7, 9) + "-" + captureProfile.slice(9, 11),
      expectedTrace: [],
      mode: captureMode,
    }];
  } else {
    profiles = COMMITTED_PROFILES.map((profile) => ({
      ...profile,
      mode: "replay",
    }));
  }

  for (const profile of profiles) {
    it(
      `replays ${profile.profile} (${profile.countryCode})`,
      async (t, onFinish) => {
        const cookieJar = new ExtendedCookieJar();
        const profiledFetch = spy(fetchDevel({
          idTransform: (id) => geoFixtureId(profile.profile, id),
          mode: profile.mode,
        }));
        const logger = spyLogger();
        const devel = { id: "getCrumb-quote-AAPL", t, onFinish };
        const fetchOptions = {
          ...defaultOptions.fetchOptions,
          headers: { ...defaultOptions.fetchOptions?.headers },
          devel,
        };

        const crumb = await _getCrumb(
          cookieJar,
          profiledFetch,
          fetchOptions,
          logger,
          "https://finance.yahoo.com/quote/AAPL",
          devel,
          true,
        );

        expect(crumb).toMatch(/\S+/);
        const configCookies = await cookieJar.getCookies("http://config.yf2/");
        expect(configCookies.find((cookie) => cookie.key === "crumb")?.value)
          .toBe(crumb);
        const yahooCookies = await cookieJar.getCookies(
          "https://finance.yahoo.com/quote/AAPL",
        );
        expect(yahooCookies.length).toBeGreaterThan(0);
        expect(
          new Headers(profiledFetch.calls[0].args[1]?.headers).get(
            "user-agent",
          ),
        ).toMatch(/^Mozilla\/5\.0 \(compatible; yahoo-finance2\//);

        const trace = profiledFetch.calls.map((call) =>
          traceEntry(call.args[0], call.args[1])
        );
        if (captureProfile) {
          console.log("GET_CRUMB_TRACE=" + JSON.stringify(trace));
        } else {
          expect(trace).toEqual(profile.expectedTrace);
        }
      },
    );
  }
});
