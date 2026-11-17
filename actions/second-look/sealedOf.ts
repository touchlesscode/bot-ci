import { createCipheriv, randomBytes } from "node:crypto"

/**
 * seals `plaintext` with AES-256-GCM under `keyBase64` (32 random bytes, SECOND_LOOK_SIGNIN_TRANSPORT_KEY) as
 * `v1.<iv>.<tag>.<ciphertext>` in base64url, so a dash session can ride a job output, whose value shows in the
 * receiving step's log, without its cookie showing anywhere. `openedOf` reverses it.
 */
export const sealedOf = (plaintext: string, keyBase64: string) => {
  const key = Buffer.from(keyBase64, "base64")
  if (key.length !== 32) throw new Error("the transport key must be 32 bytes, base64")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".")
}
