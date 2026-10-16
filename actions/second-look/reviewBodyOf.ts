import { cliNameOf } from "./cliNameOf.ts"
import type { Family } from "./types.ts"

/**
 * the review's own body: the headline, the reviewer's summary (or why there isn't one) and, when it didn't approve,
 * the force-approval hint; the testing and architecture detail stays in the summary comment
 */
export const reviewBodyOf = ({ headline, summary, hint, reviewer }: { headline: string; summary?: string; hint?: string; reviewer: Family }) =>
  [headline, ...(summary ? ["", summary] : []), ...(hint ? ["", hint] : []), "", `<sub>Reviewed via ${cliNameOf(reviewer)} · testing and architecture are in the Second Look comment</sub>`].join("\n")
