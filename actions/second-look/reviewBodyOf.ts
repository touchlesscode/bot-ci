import { cliNameOf } from "./cliNameOf.ts"
import type { Family } from "./types.ts"

/** the review's own body: the headline and the reviewer's summary; the testing and architecture detail stays in the summary comment */
export const reviewBodyOf = ({ headline, summary, reviewer }: { headline: string; summary?: string; reviewer: Family }) =>
  [headline, ...(summary ? ["", summary] : []), "", `<sub>Reviewed via ${cliNameOf(reviewer)} · testing and architecture are in the Second Look comment</sub>`].join("\n")
