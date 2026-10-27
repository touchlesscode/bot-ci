import type { Verdict } from "./types.ts"

/** a github pull request review's event */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT"

/**
 * the review a verdict becomes. a block requests changes and no verdict only comments. a pass approves only on a
 * beta-enabled pr; everywhere else it comments, so outside the beta scope second look never approves
 */
export const reviewEventOf = ({ verdict, betaEnabled }: { verdict: Verdict | undefined; betaEnabled: boolean }): ReviewEvent => {
  if (!verdict) return "COMMENT"
  if (verdict.verdict === "block") return "REQUEST_CHANGES"
  return betaEnabled === true ? "APPROVE" : "COMMENT"
}
