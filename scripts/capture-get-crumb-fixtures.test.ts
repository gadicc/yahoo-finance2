import { describe, it } from "../tests/migration/runner.ts";
import { expect } from "../tests/migration/assertions.ts";
import {
  compactFixture,
  defaultProfileId,
  geoFixtureId,
  normalizeCountryCode,
  validateProfileId,
  validateTrace,
} from "./capture-get-crumb-fixtures.ts";

function fixture(bodyText: string) {
  return {
    request: {
      url: "https://finance.yahoo.com/quote/AAPL",
      method: "GET",
      headers: {
        accept: "text/html",
        authorization: "must-not-survive",
        Cookie: "must-not-survive",
      },
    },
    response: {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        "content-type": "text/html",
        date: "volatile",
        location: "https://guce.yahoo.com/consent",
        "set-cookie": ["GUCS=anonymous; Domain=.yahoo.com; Path=/; Secure"],
      },
      bodyText,
      bodyJson: { unused: true },
      bodyBase64: "dW51c2Vk",
    },
  };
}

describe("getCrumb fixture capture helpers", () => {
  it("normalizes countries and creates a dated default profile", () => {
    expect(normalizeCountryCode("gb")).toBe("GB");
    expect(defaultProfileId("GB", new Date("2026-08-08T12:00:00Z"))).toBe(
      "gb-20260808",
    );
  });

  it("validates profile country and calendar date", () => {
    expect(validateProfileId("gb-20260808", "GB")).toBe("gb-20260808");
    expect(validateProfileId("gb-20260808-consent", "gb")).toBe(
      "gb-20260808-consent",
    );

    for (const invalid of [
      "../gb-20260808",
      "GB-20260808",
      "gbr-20260808",
      "gb-20260230",
      "gb-202608",
    ]) {
      expect(() => validateProfileId(invalid)).toThrow();
    }
    expect(() => validateProfileId("gb-20260808", "DE")).toThrow();
  });

  it("namespaces every current getCrumb fixture id", () => {
    const ids = [
      "getCrumb-quote-AAPL",
      "getCrumb-quote-AAPL-consent.html",
      "getCrumb-quote-AAPL-collectConsent.html",
      "getCrumb-quote-AAPL-collectConsentSubmit",
      "getCrumb-quote-AAPL-copyConsent",
      "getCrumb-quote-AAPL-consent-final-redirect.html",
      "getCrumb-quote-AAPL-depth-2-consent.html",
      "getCrumb-getcrumb",
    ];

    for (const id of ids) {
      expect(geoFixtureId("gb-20260808", id)).toBe(
        id.replace("getCrumb-", "getCrumb-geo-gb-20260808-"),
      );
    }
    expect(() => geoFixtureId("gb-20260808", "quote-AAPL")).toThrow();
  });

  it("keeps crumb response data and removes unrelated or sensitive data", () => {
    const compacted = compactFixture(
      "getCrumb-geo-gb-20260808-getcrumb.json",
      fixture("opaque-crumb"),
    );

    expect(compacted.response.bodyText).toBe("opaque-crumb");
    expect(compacted.response.bodyJson).toBeUndefined();
    expect(compacted.response.bodyBase64).toBeUndefined();
    expect(compacted.response.headers).toEqual({
      "content-type": "text/html",
      location: "https://guce.yahoo.com/consent",
      "set-cookie": ["GUCS=anonymous; Domain=.yahoo.com; Path=/; Secure"],
    });
    expect(compacted.request.headers).toEqual({ accept: "text/html" });
  });

  it("reduces collectConsent HTML to the hidden inputs the parser consumes", () => {
    const body = `
      <html><h1>irrelevant</h1>
      <input type="hidden" name="csrfToken" value="token">
      <input type="hidden" name="sessionId" value="session">
      </html>`;
    const compacted = compactFixture(
      "getCrumb-geo-gb-20260808-quote-AAPL-collectConsent.html.json",
      fixture(body),
    );

    expect(compacted.response.bodyText).toBe(
      '<input type="hidden" name="csrfToken" value="token">\n' +
        '<input type="hidden" name="sessionId" value="session">',
    );
    expect(compacted.response.bodyText).not.toMatch(/irrelevant/);
  });

  it("rejects unusable crumb and consent bodies", () => {
    expect(() =>
      compactFixture("getCrumb-geo-gb-20260808-getcrumb.json", fixture("")),
    ).toThrow(/empty body/);
    expect(() =>
      compactFixture(
        "getCrumb-geo-gb-20260808-quote-AAPL-collectConsent.html.json",
        fixture("<html>no form</html>"),
      ),
    ).toThrow(/no hidden inputs/);
  });

  it("drops bodies from steps that getCrumb never reads", () => {
    const compacted = compactFixture(
      "getCrumb-geo-gb-20260808-quote-AAPL.json",
      fixture("<html>large and irrelevant</html>"),
    );
    expect(compacted.response.bodyText).toBe("");
  });
});

describe("country capture trace boundary", () => {
  it("accepts only the finite getCrumb method, host and path tuples without query data", () => {
    const valid = [
      { method: "GET", host: "finance.yahoo.com", path: "/quote/AAPL" },
      {
        method: "GET",
        host: "query1.finance.yahoo.com",
        path: "/v1/test/getcrumb",
      },
    ];
    expect(validateTrace(valid)).toEqual(valid);
    for (const entry of [
      { ...valid[0], method: "POST" },
      { ...valid[0], host: "evil.invalid" },
      { ...valid[0], host: "finance.yahoo.com:443" },
      { ...valid[0], path: "/quote/AAPL?session=private" },
      { ...valid[0], path: "/unknown" },
      { ...valid[0], cookie: "private" },
      { method: 3, host: "finance.yahoo.com", path: "/quote/AAPL" },
    ])
      expect(() => validateTrace([entry, valid[1]])).toThrow();
    for (const value of [null, [], [valid[0]], Array(65).fill(valid[0])]) {
      expect(() => validateTrace(value)).toThrow();
    }
  });
});
