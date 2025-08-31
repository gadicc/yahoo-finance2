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
  });
});
