/**
 * a decrypted secrets file (sops `--output-type json`) as env-style name → value pairs. the file has to be
 * flat: env var names mapping to strings, numbers or booleans. errors name the key, never the value
 */
export const flatSecretsOf = (decrypted: unknown): Record<string, string> => {
  if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) throw new Error("the secrets file isn't a map of NAME: value")
  return Object.fromEntries(Object.entries(decrypted as Record<string, unknown>).filter(([name]) => name !== "sops").map(([name, value]) => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error(`"${name}" in the secrets file isn't an env var name`)
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error(`${name} in the secrets file isn't a plain value (nested maps and lists aren't supported)`)
    return [name, String(value)]
  }))
}
