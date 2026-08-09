import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import {
  compactFixture,
  defaultProfileId,
  geoFixtureId,
  normalizeCountryCode,
  validateProfileId,
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

    for (
      const invalid of [
        "../gb-20260808",
        "GB-20260808",
        "gbr-20260808",
        "gb-20260230",
        "gb-202608",
      ]
    ) {
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
      compactFixture(
        "getCrumb-geo-gb-20260808-getcrumb.json",
        fixture(""),
      )
    ).toThrow(/empty body/);
    expect(() =>
      compactFixture(
        "getCrumb-geo-gb-20260808-quote-AAPL-collectConsent.html.json",
        fixture("<html>no form</html>"),
      )
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
