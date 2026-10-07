import { createHash } from "node:crypto"

/** `SECOND_LOOK_SAMPLE_EVERY` as a whole number; blank, 0 or anything else means no sampling (opt-in only) */
export const sampleEveryOf = (value: string | undefined) => {
  const parsed = Number(value?.trim() || "0")
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 0
}

/**
 * a stable 1-in-`every` pick per pull request: the same pr is always in or
 * always out, so a picked pr gets a second look on every push. hashing the
 * repo with the number spreads picks across repos instead of following
 * pr numbers. `every` 0 picks nothing, 1 picks everything.
 */
export const isSampled = ({ repository, number, every }: { repository: string; number: number; every: number }) => {
  if (every < 1) return false
  if (every === 1) return true
  const hash = createHash("sha256").update(`${repository.toLowerCase()}#${number}`).digest()
  return hash.readUInt32BE(0) % every === 0
}
