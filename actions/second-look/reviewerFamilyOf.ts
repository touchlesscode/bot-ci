import type { Family, Harness } from "./types.ts"

/** the main reviewer: the other family when the harness is known, anthropic otherwise, and whichever has a key when only one does */
export const reviewerFamilyOf = (harness: Harness | undefined, keys: { anthropic: boolean; openai: boolean }): Family => {
  const wanted: Family = harness === "claude" ? "openai" : "anthropic"
  if (wanted === "openai" && !keys.openai) return "anthropic"
  if (wanted === "anthropic" && !keys.anthropic) return "openai"
  return wanted
}
