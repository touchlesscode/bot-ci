import type { Verdict } from "./types.ts"

/** a github pull request review's event */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT"

/** a pass approves and a block requests changes; without a verdict the review only comments */
export const reviewEventOf = (verdict: Verdict | undefined): ReviewEvent => {
  if (!verdict) return "COMMENT"
  return verdict.verdict === "pass" ? "APPROVE" : "REQUEST_CHANGES"
}
