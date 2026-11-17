import type { SessionCookie } from "./sessionCookiesOf.ts"

/** `cookies` as one `Cookie` request header value */
export const cookieHeaderOf = (cookies: readonly SessionCookie[]) => cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
