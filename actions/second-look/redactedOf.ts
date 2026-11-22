const placeholder = "[redacted]"

/** shapes that are credentials whatever they belong to: JWTs, bearer headers, cookie headers, dash's session cookie, sealed values, vendor tokens, private keys, and values of secret-named keys */
const credentialShapes = [
  /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g,
  /\b(Bearer\s+)[\w.~+/=-]{8,}/gi,
  /\b((?:set-)?cookie\s*[:=]\s*)[^\n"'`|]+/gi,
  /\b(exo-dash-session=)[^;\s"'`|]+/gi,
  /\bv1\.[\w-]{16}\.[\w-]{22}\.[\w-]{16,}/g,
  // vendor tokens by their prefixes: github, slack, aws, openai and anthropic, google, npm, stripe
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  /\bx(?:ox[abeoprs]|app)-[A-Za-z0-9-]{10,}/g,
  /\bA(?:KIA|SIA)[0-9A-Z]{16}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bnpm_[A-Za-z0-9]{30,}/g,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  // a value given to a secret-named key, when it holds a digit (so "token: configuration" stays)
  /\b((?:api[_-]?key|access[_-]?token|secret|password|passwd|token)\s*[:=]\s*["']?)(?=[^\s"'`|,;]*\d)[^\s"'`|,;]{12,}/gi,
]

/**
 * `text` with every exact `secrets` value (8 characters or more) and every credential-shaped string replaced
 * by `[redacted]`: what a tester's report goes through before it's written, read back or posted.
 */
export const redactedOf = (text: string, secrets: readonly string[] = []) => {
  const exact = secrets.filter((secret) => secret.length >= 8).reduce((current, secret) => current.split(secret).join(placeholder), text)
  return credentialShapes.reduce((current, shape) => current.replace(shape, (_match, prefix?: unknown) => `${typeof prefix === "string" ? prefix : ""}${placeholder}`), exact)
}
