export function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = Reflect.get(headers, "getSetCookie");
  return typeof getSetCookie === "function" ? getSetCookie.call(headers) : [];
}
