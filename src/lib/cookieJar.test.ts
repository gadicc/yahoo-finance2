import { describe, expect, it } from "../../tests/common.ts";
import { ExtendedCookieJar } from "./cookieJar.ts";

describe("ExtendedCookieJar", () => {
  it("single string header sets a cookie", async () => {
    const jar = new ExtendedCookieJar();
    const url = "https://finance.yahoo.com/";
    await jar.setFromSetCookieHeaders(
      "A1=v1; Domain=.yahoo.com; Path=/",
      url,
    );

    const cookies = await jar.getCookies(url);
    expect(cookies.length).toBe(1);
    expect(cookies[0].key).toBe("A1");
    expect(cookies[0].value).toBe("v1");
  });

  it("array of headers sets multiple cookies", async () => {
    const jar = new ExtendedCookieJar();
    const url = "https://finance.yahoo.com/";
    await jar.setFromSetCookieHeaders(
      [
        "A1=v1; Domain=.yahoo.com; Path=/",
        "B2=v2; Domain=.yahoo.com; Path=/",
      ],
      url,
    );

    const cookies = await jar.getCookies(url);
    expect(cookies.length).toBe(2);
    const keys = cookies.map((c) => c.key);
    const values = cookies.map((c) => c.value);
    expect(keys).toEqual(expect.arrayContaining(["A1", "B2"]));
    expect(values).toEqual(expect.arrayContaining(["v1", "v2"]));
  });

  it("unparseable header is skipped silently", async () => {
    const jar = new ExtendedCookieJar();
    const url = "https://finance.yahoo.com/";

    // should not throw and not add any cookies
    await jar.setFromSetCookieHeaders("invalid-cookie-format-here", url);

    const cookies = await jar.getCookies(url);
    expect(cookies.length).toBe(0);
  });

  it("undefined header is a no-op", async () => {
    const jar = new ExtendedCookieJar();
    const url = "https://finance.yahoo.com/";

    // @ts-ignore testing invalid/undefined input
    await jar.setFromSetCookieHeaders(undefined, url);

    const cookies = await jar.getCookies(url);
    expect(cookies.length).toBe(0);
  });

  it("domain scoping: cookies are shared on matching subdomains but not other domains", async () => {
    const jar = new ExtendedCookieJar();
    const url = "https://finance.yahoo.com/";
    await jar.setFromSetCookieHeaders(
      "A1=v1; Domain=.yahoo.com; Path=/",
      url,
    );

    // sub-domain of yahoo.com should match
    const subDomainCookies = await jar.getCookies(
      "https://query1.finance.yahoo.com/",
    );
    expect(subDomainCookies.length).toBe(1);
    expect(subDomainCookies[0].key).toBe("A1");

    // unrelated domain should not match
    const otherDomainCookies = await jar.getCookies("https://example.com/");
    expect(otherDomainCookies.length).toBe(0);
  });
});
