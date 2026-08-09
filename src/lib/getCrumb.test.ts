import {
  describe,
  expect,
  fetchDevel,
  it,
  setupCache,
  spy,
  spyLogger,
} from "../../tests/common.ts";

import getCrumb, { _getCrumb, getCrumbClear } from "./getCrumb.ts";
import { ExtendedCookieJar } from "./cookieJar.ts";
import type Notices from "./notices.ts";

describe("getCrumb", () => {
  setupCache();
  const cookieJar = new ExtendedCookieJar();
  const fetch = fetchDevel();
  const logger = spyLogger();

  describe("_getCrumb", () => {
    it("finds crumb in context", async (t, onFinish) => {
      const devel = { id: "getCrumb-quote-AAPL", t, onFinish };

      const crumb = await _getCrumb(
        new ExtendedCookieJar(),
        fetch,
        { devel },
        logger,
        "https://finance.yahoo.com/quote/AAPL",
        devel,
        true,
      );
      expect(crumb).toBe("haT3oykhHqZ");
    });

    it(
      "ditto with shared cookie jar (don't use it for other tests)",
      async (t, onFinish) => {
        const devel = { id: "getCrumb-quote-AAPL", t, onFinish };

        const crumb = await _getCrumb(cookieJar, fetch, { devel }, logger);
        expect(crumb).toBe("haT3oykhHqZ");
      },
    );

    it("re-uses cookie", async (t, onFinish) => {
      const devel = { id: "getCrumb-quote-AAPL", t, onFinish };

      let crumb = await _getCrumb(
        cookieJar,
        fetch,
        { devel },
        logger,
        "https://finance.yahoo.com/quote/AAPL",
      );
      expect(crumb).toBe("haT3oykhHqZ");

      // TODO, at tests to see how many times fetch was called, etc.

      crumb = await _getCrumb(
        cookieJar,
        fetch,
        { devel },
        logger,
        "https://finance.yahoo.com/quote/AAPL",
      );
      expect(crumb).toBe("haT3oykhHqZ");
    });

    it("follows a direct consent return to Yahoo Finance", async () => {
      const calls: Array<{
        url: string;
        cookie: string | null;
        fixtureId?: string;
      }> = [];
      const directConsentFetch = (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);
        calls.push({
          url,
          cookie: new Headers(init?.headers).get("cookie"),
          fixtureId: (init as RequestInit & {
            devel?: { id?: string };
          })?.devel?.id,
        });

        if (url === "https://finance.yahoo.com/quote/AAPL") {
          return Promise.resolve(
            new Response(null, {
              status: 307,
              headers: {
                location: "https://guce.yahoo.com/consent?step=1",
                "set-cookie":
                  "GUCS=consent-session; Max-Age=1800; Domain=.yahoo.com; Path=/; Secure",
              },
            }),
          );
        }
        if (url === "https://guce.yahoo.com/consent?step=1") {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: {
                location: "https://finance.yahoo.com/quote/AAPL?guccounter=1",
                "set-cookie":
                  "A1=consented; Max-Age=1800; Domain=.yahoo.com; Path=/; Secure",
              },
            }),
          );
        }
        if (url === "https://finance.yahoo.com/quote/AAPL?guccounter=1") {
          return Promise.resolve(
            new Response(null, {
              status: 307,
              headers: {
                location: "https://guce.yahoo.com/consent?step=2",
              },
            }),
          );
        }
        if (url === "https://guce.yahoo.com/consent?step=2") {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: {
                location: "https://finance.yahoo.com/quote/AAPL?guccounter=2",
              },
            }),
          );
        }
        if (url === "https://finance.yahoo.com/quote/AAPL?guccounter=2") {
          return Promise.resolve(
            new Response(null, {
              status: 307,
              headers: {
                location: "https://guce.yahoo.com/consent?step=3",
              },
            }),
          );
        }
        if (url === "https://guce.yahoo.com/consent?step=3") {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: {
                location:
                  "https://finance.yahoo.com/quote/AAPL?_guc_consent_skip=1",
              },
            }),
          );
        }
        if (
          url === "https://finance.yahoo.com/quote/AAPL?_guc_consent_skip=1"
        ) {
          return Promise.resolve(new Response("", { status: 200 }));
        }
        if (url === "https://query1.finance.yahoo.com/v1/test/getcrumb") {
          return Promise.resolve(new Response("nl-crumb", { status: 200 }));
        }
        throw new Error("Unexpected test request to " + url);
      };

      const crumb = await _getCrumb(
        new ExtendedCookieJar(),
        directConsentFetch,
        {},
        logger,
        "https://finance.yahoo.com/quote/AAPL",
        {},
        true,
      );

      expect(crumb).toBe("nl-crumb");
      expect(calls.map((call) => call.url)).toEqual([
        "https://finance.yahoo.com/quote/AAPL",
        "https://guce.yahoo.com/consent?step=1",
        "https://finance.yahoo.com/quote/AAPL?guccounter=1",
        "https://guce.yahoo.com/consent?step=2",
        "https://finance.yahoo.com/quote/AAPL?guccounter=2",
        "https://guce.yahoo.com/consent?step=3",
        "https://finance.yahoo.com/quote/AAPL?_guc_consent_skip=1",
        "https://query1.finance.yahoo.com/v1/test/getcrumb",
      ]);
      expect(calls.map((call) => call.fixtureId)).toEqual([
        undefined,
        "getCrumb-quote-AAPL-consent.html",
        "getCrumb-quote-AAPL-consent-final-redirect.html",
        "getCrumb-quote-AAPL-depth-1-consent.html",
        "getCrumb-quote-AAPL-depth-2-consent-final-redirect.html",
        "getCrumb-quote-AAPL-depth-2-consent.html",
        "getCrumb-quote-AAPL-depth-3-consent-final-redirect.html",
        "getCrumb-getcrumb",
      ]);
      expect(calls[1].cookie).toContain("GUCS=consent-session");
      expect(calls[2].cookie).toContain("A1=consented");
      expect(calls[7].cookie).toContain("A1=consented");
    });

    it("throws on no cookies", async (t, onFinish) => {
      const devel = { id: "getCrumb-quote-AAPL-no-cookies.fake", t, onFinish };

      await expect(
        _getCrumb(
          new ExtendedCookieJar(),
          fetch,
          { devel },
          logger,
          "https://finance.yahoo.com/quote/AAPL",
          devel,
          true,
        ),
      ).rejects.toThrow(/No set-cookie/);
    });

    /*
    test for commented out code.
    it("throws on no context", async () => {
      const fetch = await env.fetchDevel();

      await expect(() =>
        _getCrumb(
          new ExtendedCookieJar(),
          fetch,
          { devel: true },
          logger,
          "https://finance.yahoo.com/quote/AAPL",
          "getCrumb-quote-AAPL-no-context.fake.json",
          true
        )
      ).rejects.toThrowError(/Could not find window.YAHOO.context/);
    });

    it("throws on invalid json", async () => {
      const fetch = await env.fetchDevel();

      await expect(() =>
        _getCrumb(
          new ExtendedCookieJar(),
          fetch,
          { devel: true },
          logger,
          "https://finance.yahoo.com/quote/AAPL",
          "getCrumb-quote-AAPL-invalid-json.fake.json",
          true
        )
      ).rejects.toThrowError(/Could not parse window.YAHOO.context/);
    });

    it("throws on no crumb", async () => {
      const fetch = await env.fetchDevel();

      await expect(() =>
        _getCrumb(
          new ExtendedCookieJar(),
          fetch,
          { devel: true },
          logger,
          "https://finance.yahoo.com/quote/AAPL",
          "getCrumb-quote-AAPL-no-crumb.fake.json",
          true
        )
      ).rejects.toThrowError(/Could not find crumb/);
    });
    */

    /*
    it(
      "redirect https://guce.yahoo.com/consent?brandType=nonEu",
      async (t, onFinish) => {
        const devel = {
          id: "getCrumb-quote-AAPL-pre-consent-VPN-UK.fake",
          t,
          onFinish,
        };

        const crumb = await _getCrumb(
          new ExtendedCookieJar(),
          fetch,
          { devel },
          logger,
          "https://finance.yahoo.com/quote/AAPL",
          devel,
          true,
        );
        expect(crumb).toBe("mloUP8q7ZPH");
      },
    );
    */
  });

  describe("getCrumb", () => {
    const cookieJar = new ExtendedCookieJar();
    const notices = { show() {} } as unknown as Notices;

    it("works", async (t, onFinish) => {
      await getCrumbClear(cookieJar);
      const devel = { id: "getCrumb-quote-AAPL", t, onFinish };
      const crumb = await getCrumb(
        cookieJar,
        fetch,
        { devel },
        logger,
        notices,
      );
      expect(crumb).toBe("haT3oykhHqZ");
    });

    it("only calls getCrumb once", async (t, onFinish) => {
      const devel = { id: "getCrumb-quote-AAPL", t, onFinish };
      const _getCrumb = spy(() => "crumb");
      await getCrumbClear(cookieJar);

      getCrumb(
        cookieJar,
        fetch,
        { devel },
        logger,
        notices,
        "https://finance.yahoo.com/quote/TSLA",
        // @ts-expect-error: stub
        _getCrumb,
      );

      getCrumb(
        cookieJar,
        fetch,
        { devel },
        logger,
        notices,
        "https://finance.yahoo.com/quote/TSLA",
        // @ts-expect-error: stub
        _getCrumb,
      );

      // expect(_getCrumb).toHaveBeenCalledTimes(1);
      expect(_getCrumb.calls).toHaveLength(1);
    });

    it("retries after getCrumb attempt rejects", async (t, onFinish) => {
      const devel = { id: "getCrumb-quote-AAPL", t, onFinish };
      let attempts = 0;
      const _getCrumb = spy(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error("temporary crumb failure"));
        }
        return Promise.resolve("crumb");
      });
      await getCrumbClear(cookieJar);

      await expect(
        getCrumb(
          cookieJar,
          fetch,
          { devel },
          logger,
          notices,
          "https://finance.yahoo.com/quote/TSLA",
          _getCrumb,
        ),
      ).rejects.toThrow(/temporary crumb failure/);

      const crumb = await getCrumb(
        cookieJar,
        fetch,
        { devel },
        logger,
        notices,
        "https://finance.yahoo.com/quote/TSLA",
        _getCrumb,
      );

      expect(crumb).toBe("crumb");
      expect(_getCrumb.calls).toHaveLength(2);
    });

    it("scopes crumb cache to the cookie jar", async (t, onFinish) => {
      const devel = { id: "getCrumb-quote-AAPL", t, onFinish };
      const _getCrumb = spy(() => Promise.resolve("crumb"));
      const jarA = new ExtendedCookieJar();
      const jarB = new ExtendedCookieJar();
      await getCrumbClear(jarA);
      await getCrumbClear(jarB);

      await getCrumb(
        jarA,
        fetch,
        { devel },
        logger,
        notices,
        "https://finance.yahoo.com/quote/TSLA",
        _getCrumb,
      );

      await getCrumb(
        jarB,
        fetch,
        { devel },
        logger,
        notices,
        "https://finance.yahoo.com/quote/TSLA",
        _getCrumb,
      );

      await getCrumb(
        jarA,
        fetch,
        { devel },
        logger,
        notices,
        "https://finance.yahoo.com/quote/TSLA",
        _getCrumb,
      );

      expect(_getCrumb.calls).toHaveLength(2);
    });

    it(
      "throws if depth exceeds MAX_CONSENT_REDIRECT_DEPTH",
      async (t, onFinish) => {
        const devel = { id: "getCrumb-quote-AAPL", t, onFinish };
        const jar = new ExtendedCookieJar();
        await getCrumbClear(jar);

        await expect(
          _getCrumb(
            jar,
            fetch,
            { devel },
            logger,
            "https://finance.yahoo.com/quote/TSLA",
            devel,
            false,
            6,
          ),
        ).rejects.toThrow(/Too many consent redirects/);
      },
    );
  });
});
