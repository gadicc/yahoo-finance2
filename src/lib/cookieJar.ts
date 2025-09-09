// The following is for ts-json-schema-generator, which can't find the
// module installed by Deno, but isn't ussed in the exported schema.
// @ts-ignore: as above
import { Cookie, CookieJar } from "tough-cookie";

/**
 * ExtendedCookieJar extends the `npm:tough-cookie`
 * {@linkcode https://github.com/salesforce/tough-cookie/blob/master/api/docs/tough-cookie.cookiejar.md|CookieJar}
 * class with the methods below but can otherwise be instantiated as
 * usual, particularly with custom stores, either by extending the tough-cookie
 * {@linkcode https://github.com/salesforce/tough-cookie/blob/master/api/docs/tough-cookie.store.md Store}
 * class yourself or finding an existing package that does so, e.g.
 * {@link https://www.npmjs.com/search?q=tough-cookie%20store "tough-cookie store"} search on npm.
 *
 * @example File Store
 * ```ts
 * import os from "os";
 * import path from "path";
 * import YahooFinance from "yahoo-finance2";
 * import { FileCookieStore } from "tough-cookie-file-store";
 * import { ExtendedCookieJar } from "yahoo-finance2/lib/options";
 *
 * const cookiePath = path.join(os.homedir(), ".yf2-cookies.json");
 * const cookieJar = new ExtendedCookieJar(new FileCookieStore(cookiePath));
 * const yahooFinance = new YahooFinance({ cookieJar });
 * ```
 * This is the same code we use in the CLI to store cookies in your home directory,
 * but obviously is not relevant for ephemeral serverless / edge functions which
 * requires external backing (in e.g. a database or redis).
 */
export class ExtendedCookieJar extends CookieJar {
  /**
   * Sets cookies in the jar from the `Set-Cookie` headers.
   */
  async setFromSetCookieHeaders(
    setCookieHeader: string | Array<string>,
    url: string,
  ) {
    let cookies;
    // console.log("setFromSetCookieHeaders", setCookieHeader);

    if (typeof setCookieHeader === "undefined") {
      // no-op
    } else if (setCookieHeader instanceof Array) {
      cookies = setCookieHeader.map((header) => Cookie.parse(header));
    } else if (typeof setCookieHeader === "string") {
      cookies = [Cookie.parse(setCookieHeader)];
    }

    if (cookies) {
      for (const cookie of cookies) {
        if (cookie instanceof Cookie) {
          // console.log("setCookieSync", cookie, url);
          // @ts-ignore: relevant for ts-json-schema-generator
          await this.setCookie(cookie, url);
        }
      }
    }
  }
}
