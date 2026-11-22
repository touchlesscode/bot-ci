/** one cookie a preview set, in the shape Playwright's storage state takes */
export type SessionCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: "Strict" | "Lax" | "None"
}

const sameSites: Record<string, SessionCookie["sameSite"]> = { strict: "Strict", lax: "Lax", none: "None" }

/**
 * the cookies a sign-in response set for `origin`'s host, from its `Set-Cookie` headers (`Headers.getSetCookie()`),
 * skipping ones it cleared (empty value or max-age 0). `nowSeconds` dates max-age.
 */
export const sessionCookiesOf = (setCookies: readonly string[], origin: string, nowSeconds = Math.floor(Date.now() / 1000)): SessionCookie[] =>
  setCookies.flatMap((header) => {
    const [pair, ...attributes] = header.split(";").map((part) => part.trim())
    const separator = pair.indexOf("=")
    if (separator < 1) return []
    const cookie: SessionCookie = { name: pair.slice(0, separator), value: pair.slice(separator + 1), domain: new URL(origin).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }
    let cleared = !cookie.value
    for (const attribute of attributes) {
      const [rawKey, ...rest] = attribute.split("=")
      const key = rawKey.toLowerCase()
      const value = rest.join("=")
      if (key === "path" && value) cookie.path = value
      if (key === "httponly") cookie.httpOnly = true
      if (key === "secure") cookie.secure = true
      if (key === "samesite") cookie.sameSite = sameSites[value.toLowerCase()] ?? "Lax"
      if (key === "expires" && cookie.expires === -1 && !Number.isNaN(Date.parse(value))) cookie.expires = Math.floor(Date.parse(value) / 1000)
      if (key === "max-age" && /^-?\d+$/.test(value)) {
        cookie.expires = nowSeconds + Number(value)
        cleared ||= Number(value) <= 0
      }
    }
    return cleared ? [] : [cookie]
  })
