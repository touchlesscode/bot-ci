import type { SessionCookie } from "./sessionCookiesOf.ts"

/** `cookies` as a Netscape cookie jar, the file curl reads with `-b` */
export const cookieJarOf = (cookies: readonly SessionCookie[]) =>
  ["# Netscape HTTP Cookie File", ...cookies.map((cookie) => [
    `${cookie.httpOnly ? "#HttpOnly_" : ""}${cookie.domain}`,
    "FALSE",
    cookie.path,
    cookie.secure ? "TRUE" : "FALSE",
    String(Math.max(cookie.expires, 0)),
    cookie.name,
    cookie.value,
  ].join("\t"))].join("\n") + "\n"
