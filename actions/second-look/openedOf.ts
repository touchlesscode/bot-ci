import { createDecipheriv } from "node:crypto"

/** the plaintext `sealedOf` sealed under `keyBase64`; throws on a wrong key, a tampered value or another format */
export const openedOf = (sealed: string, keyBase64: string) => {
  const [version, iv, tag, ciphertext] = sealed.trim().split(".")
  if (version !== "v1" || !iv || !tag || ciphertext === undefined) throw new Error("not a sealed v1 value")
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")
}
