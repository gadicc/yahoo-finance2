/**
 * Yahoo Finance Crumb and Cookie Fetcher
 * @module getCrumb
 */
import type { ExtendedCookieJar } from "./cookieJar.ts";
import type { Logger } from "./options/logger.ts";
import { Cookie } from "tough-cookie";
import type Notices from "./notices.ts";
import type { YahooFinanceFetchModuleOptions } from "./yahooFinanceFetch.ts";

type Fetch = typeof fetch;
const CONFIG_FAKE_URL = "http://config.yf2/";

let crumb: string | null = null;

const parseHtmlEntities = (str: string) =>
  str.replace(
    /&#x([0-9A-Fa-f]{1,3});/gi,
    (_, numStr) => String.fromCharCode(parseInt(numStr, 16)),
  );

type CrumbOptions = Parameters<typeof fetch>[1] & {
  devel?: YahooFinanceFetchModuleOptions["devel"];
};

/**
 * Returns the crumb needed for Yahoo Finance requests - from
 * the cookieJar if it exists (where we store it with a fake URL),
 * otherwise, follows the necessary redirect flow on Yahoo Finance
 * to get a fresh one.
 *
 * @param cookieJar The cookie jar to use for storing and retrieving cookies.
 * @param fetch The fetch function to use for making HTTP requests.
 * @param fetchOptionsBase The base options to use for the fetch requests.
 * @param logger The logger to use for logging debug information.
 * @param url The URL to fetch the crumb from.
 * @param develOverride Development options to override the default behavior.
 * @param noCache Never use the cached crumb.
 * @returns The fetched crumb or null if not found.
 */
export async function _getCrumb(
  cookieJar: ExtendedCookieJar,
  fetch: Fetch,
  fetchOptionsBase: CrumbOptions,
  logger: Logger,
  url = "https://finance.yahoo.com/quote/AAPL",
  develOverride: Partial<YahooFinanceFetchModuleOptions["devel"]> = {
    id: "getCrumb-quote-AAPL",
    // By default, unset onFinish, so that a failing test calling getCrumb
    // won't "fail" this call (which isn't actually a test) and, e.g., in
    // the case of FETCH_DEVEL=recache, won't rewrite the json with this id.
    onFinish: undefined,
  },
  noCache = false,
): Promise<string | null> {
  if (!crumb) {
    const cookies = await cookieJar.getCookies(CONFIG_FAKE_URL);
    for (const cookie of cookies) {
      if (cookie.key === "crumb") {
        crumb = cookie.value;
        logger.debug("Retrieved crumb from cookie store: " + crumb);
        break;
      }
    }
  }

  if (crumb && !noCache) {
    // If we still have a valid (non-expired) cookie, return the existing crumb.
    const existingCookies = await cookieJar.getCookies(url, { expire: true });
    if (existingCookies.length) return crumb;
  }

  async function processSetCookieHeader(
    header: string[] | undefined,
    url: string,
  ) {
    if (header) {
      await cookieJar.setFromSetCookieHeaders(header, url);
      return true;
    }
    return false;
  }

  logger.debug("Fetching crumb and cookies from " + url + "...");

  const fetchOptions: CrumbOptions = {
    ...fetchOptionsBase,
    headers: {
      ...fetchOptionsBase.headers,
      // NB, we won't get a set-cookie header back without this:
      accept: "text/html,application/xhtml+xml,application/xml",
      // This request will get our first cookies, so nothing to send.
      // cookie: await cookieJar.getCookieString(url),
    },
    redirect: "manual",
  };

  if (fetchOptionsBase.devel) {
    fetchOptions.devel = {
      ...fetchOptionsBase.devel,
      ...develOverride,
    };
  }

  const response = await fetch(url, fetchOptions);
  await processSetCookieHeader(response.headers.getSetCookie(), url);

  // logger.debug(response.headers.raw());
  // logger.debug(cookieJar);

  const location = response.headers.get("location");
  if (location) {
    if (location.match(/guce.yahoo/)) {
      const consentFetchOptions: typeof fetchOptions = {
        ...fetchOptions,
        headers: {
          ...fetchOptions.headers,
          // GUCS=XXXXXXXX; Max-Age=1800; Domain=.yahoo.com; Path=/; Secure
          cookie: await cookieJar.getCookieString(location),
        },
        devel: {
          id: "getCrumb-quote-AAPL-consent.html",
          t: develOverride!.t,
          onFinish: develOverride!.onFinish!,
        },
      };
      // Returns 302 to collectConsent?sessionId=XXX
      logger.debug("fetch", location /*, consentFetchOptions */);
      const consentResponse = await fetch(location, consentFetchOptions);
      const consentLocation = consentResponse.headers.get("location");

      if (consentLocation) {
        if (!consentLocation.match(/collectConsent/)) {
          throw new Error("Unexpected redirect to " + consentLocation);
        }

        const collectConsentFetchOptions: typeof fetchOptions = {
          ...consentFetchOptions,
          headers: {
            ...fetchOptions.headers,
            cookie: await cookieJar.getCookieString(consentLocation),
          },
          devel: {
            id: "getCrumb-quote-AAPL-collectConsent.html",
            t: develOverride!.t,
            onFinish: develOverride!.onFinish!,
          },
        };
        logger.debug(
          "fetch",
          consentLocation, /*, collectConsentFetchOptions */
        );

        const collectConsentResponse = await fetch(
          consentLocation,
          collectConsentFetchOptions,
        );
        const collectConsentBody = await collectConsentResponse.text();

        const collectConsentResponseParams = [
          ...collectConsentBody.matchAll(
            /<input type="hidden" name="([^"]+)" value="([^"]+)">/g,
          ),
        ]
          .map(
            ([, name, value]) =>
              `${name}=${encodeURIComponent(parseHtmlEntities(value))}&`,
          )
          .join("") + "agree=agree&agree=agree";

        const collectConsentSubmitFetchOptions: typeof fetchOptions = {
          ...consentFetchOptions,
          headers: {
            ...fetchOptions.headers,
            cookie: await cookieJar.getCookieString(consentLocation),
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
          // body: "csrfToken=XjJfOYU&sessionId=3_cc-session_bd9a3b0c-c1b4-4aa8-8c18-7a82ec68a5d5&originalDoneUrl=https%3A%2F%2Ffinance.yahoo.com%2Fquote%2FAAPL%3Fguccounter%3D1&namespace=yahoo&agree=agree&agree=agree",
          body: collectConsentResponseParams,
          devel: {
            id: "getCrumb-quote-AAPL-collectConsentSubmit",
            t: develOverride!.t,
            onFinish: develOverride!.onFinish!,
          },
        };
        logger.debug(
          "fetch",
          consentLocation, /*, collectConsentSubmitFetchOptions */
        );
        const collectConsentSubmitResponse = await fetch(
          consentLocation,
          collectConsentSubmitFetchOptions,
        );

        // Set-Cookie: CFC=AQABCAFkWkdkjEMdLwQ9&s=AQAAAClxdtC-&g=ZFj24w; Expires=Wed, 8 May 2024 01:18:54 GMT; Domain=consent.yahoo.com; Path=/; Secure
        if (
          !(await processSetCookieHeader(
            collectConsentSubmitResponse.headers.getSetCookie(),
            consentLocation,
          ))
        ) {
          throw new Error(
            "No set-cookie header on collectConsentSubmitResponse, please report.",
          );
        }

        // https://guce.yahoo.com/copyConsent?sessionId=3_cc-session_04da10ea-1025-4676-8175-60d2508bfc6c&lang=en-GB
        const collectConsentSubmitResponseLocation =
          collectConsentSubmitResponse.headers.get("location");
        if (!collectConsentSubmitResponseLocation) {
          throw new Error(
            "collectConsentSubmitResponse(1) unexpectedly did not return a Location header, please report.",
          );
        }

        const copyConsentFetchOptions: typeof fetchOptions = {
          ...consentFetchOptions,
          headers: {
            ...fetchOptions.headers,
            cookie: await cookieJar.getCookieString(
              collectConsentSubmitResponseLocation,
            ),
          },
          devel: {
            id: "getCrumb-quote-AAPL-copyConsent",
            t: develOverride!.t,
            onFinish: develOverride!.onFinish!,
          },
        };

        logger.debug(
          "fetch",
          collectConsentSubmitResponseLocation, /*, copyConsentFetchOptions */
        );
        const copyConsentResponse = await fetch(
          collectConsentSubmitResponseLocation,
          copyConsentFetchOptions,
        );

        if (
          !(await processSetCookieHeader(
            copyConsentResponse.headers.getSetCookie(),
            collectConsentSubmitResponseLocation,
          ))
        ) {
          throw new Error(
            "No set-cookie header on copyConsentResponse, please report.",
          );
        }

        const copyConsentResponseLocation = copyConsentResponse.headers.get(
          "location",
        );
        if (!copyConsentResponseLocation) {
          throw new Error(
            "collectConsentSubmitResponse(2) unexpectedly did not return a Location header, please report.",
          );
        }

        const finalResponseFetchOptions: typeof fetchOptions = {
          ...fetchOptions,
          headers: {
            ...fetchOptions.headers,
            cookie: await cookieJar.getCookieString(
              collectConsentSubmitResponseLocation,
            ),
          },
          devel: {
            id: "getCrumb-quote-AAPL-consent-final-redirect.html",
            t: develOverride!.t,
            onFinish: develOverride!.onFinish!,
          },
        };

        return await _getCrumb(
          cookieJar,
          fetch,
          finalResponseFetchOptions,
          logger,
          copyConsentResponseLocation,
          {
            id: "getCrumb-quote-AAPL-consent-final-redirect.html",
            t: develOverride!.t,
            onFinish: develOverride!.onFinish,
          },
          noCache,
        );
      }
    } else {
      // These seems to happen frequently without causing issues.
      /*
      logger.warn(
        "We expected a redirect to guce.yahoo.com, but got " + location + ". " +
          "We'll try to continue anyway - you can safely ignore this if the request succeeds",
      );
      */
      // throw new Error(
      // "Unsupported redirect to " + location + ", please report.");
      // )
    }
  }

  const cookie = (await cookieJar.getCookies(url, { expire: true }))[0];
  if (cookie) {
    logger.debug("Success. Cookie expires on " + cookie.expires);
  } else {
    /*
    logger.error(
      "No cookie was retreieved.  Probably the next request " +
        "will fail.  Please report."
    );
    */
    throw new Error(
      "No set-cookie header present in Yahoo's response.  Something must have changed, please report.",
    );
  }

  /*
  // This is the old way of getting the crumb, which is no longer working.
  // Instead we make use of the code block that follows this comment, which
  // uses the `/v1/test/getcrumb` endpoint.  However, the commented code
  // below may still be useful in the future, so it is left here for now.

  const source = await response.text();

  // Could also match on window.YAHOO.context = { /* multi-line JSON */
  /* }
  const match = source.match(/\nwindow.YAHOO.context = ({[\s\S]+\n});\n/);
  if (!match) {
    throw new Error(
      "Could not find window.YAHOO.context.  This is usually caused by " +
        "temporary issues on Yahoo's servers that tend to resolve " +
        "themselves; however, if the error persists for more than 12 " +
        "hours, Yahoo's API may have changed, and you can help by reporting " +
        "the issue.  Thanks :)"
    );
  }

  let context;
  try {
    context = JSON.parse(match[1]);
  } catch (error) {
    logger.debug(match[1]);
    logger.error(error);
    throw new Error(
      "Could not parse window.YAHOO.context.  Yahoo's API may have changed; please report."
    );
  }

  crumb = context.crumb;
  */

  const GET_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";
  const getCrumbOptions: typeof fetchOptions = {
    ...fetchOptions,
    headers: {
      ...fetchOptions.headers,
      cookie: await cookieJar.getCookieString(GET_CRUMB_URL),
      origin: "https://finance.yahoo.com",
      referer: url,
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "text/plain",
    },
    devel: {
      id: "getCrumb-getcrumb",
      t: develOverride!.t,
      onFinish: develOverride!.onFinish!,
    },
  };

  logger.debug("fetch", GET_CRUMB_URL /*, getCrumbOptions */);
  const getCrumbResponse = await fetch(GET_CRUMB_URL, getCrumbOptions);
  if (getCrumbResponse.status !== 200) {
    throw new Error(
      "Failed to get crumb, status " +
        getCrumbResponse.status +
        ", statusText: " +
        getCrumbResponse.statusText,
    );
  }

  const crumbFromGetCrumb = await getCrumbResponse.text();
  crumb = crumbFromGetCrumb;
  if (!crumb) {
    throw new Error(
      "Could not find crumb.  Yahoo's API may have changed; please report.",
    );
  }

  logger.debug("New crumb: " + crumb);
  await cookieJar.setCookie(
    new Cookie({
      key: "crumb",
      value: crumb,
    }),
    CONFIG_FAKE_URL,
  );

  promise = null;
  return crumb;
}

let promise: Promise<string | null> | null = null;

/**
 * Clears the stored crumb and all cookies in the given jar.
 * Doubtful you'll ever use this outside development and testing.
 */
export async function getCrumbClear(cookieJar: ExtendedCookieJar) {
  crumb = null;
  promise = null;
  await cookieJar.removeAllCookies();
}

/**
 * Gets the crumb for Yahoo Finance requests.
 * See {@linkcode _getCrumb}.
 *
 * This small wrapper around the above ensures we only make one
 * request, and queues the same return value otherwise.
 */
export default function getCrumb(
  cookieJar: ExtendedCookieJar,
  fetch: Fetch,
  fetchOptionsBase: CrumbOptions,
  logger: Logger,
  notices: Notices,
  url = "https://finance.yahoo.com/quote/AAPL",
  __getCrumb = _getCrumb,
): Promise<string | null> {
  notices.show("yahooSurvey");

  if (!promise) {
    promise = __getCrumb(cookieJar, fetch, fetchOptionsBase, logger, url);
  }

  return promise;
}
