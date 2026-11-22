import { cookieHeaderOf } from "./cookieHeaderOf.ts"
import type { SessionCookie } from "./sessionCookiesOf.ts"

/** whether a session reached a signed-in page, and a note that never holds a cookie or token */
export type SignedInPage = { ok: boolean; note: string }

/**
 * GETs the preview's home page with `cookies`, not following redirects: a 200 is a signed-in page, a redirect to
 * /login or a 401/403 is not. dash sends a signed-out visitor to `/login?redirectTo=…`.
 */
export const signedInPageOf = async ({ fetch, origin, cookies }: { fetch: typeof globalThis.fetch; origin: string; cookies: readonly SessionCookie[] }): Promise<SignedInPage> => {
  try {
    const response = await fetch(new URL("/", origin), { headers: { cookie: cookieHeaderOf(cookies) }, redirect: "manual", signal: AbortSignal.timeout(15_000) })
    const location = response.headers.get("location") ?? ""
    if (response.status === 200) return { ok: true, note: `${origin}/ answered 200 signed in` }
    if (response.status >= 300 && response.status < 400) return { ok: false, note: `${origin}/ redirected to ${new URL(location, origin).pathname}, so the session isn't signed in` }
    return { ok: false, note: `${origin}/ answered ${response.status}` }
  } catch (error) {
    return { ok: false, note: `${origin}/ didn't answer (${(error as Error).message})` }
  }
}
