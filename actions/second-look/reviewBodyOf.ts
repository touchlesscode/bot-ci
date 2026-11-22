import { cliNameOf } from "./cliNameOf.ts"
import type { Family } from "./types.ts"

/** the footer's mark on a review whose reviewer couldn't read the repo: fixed text, so such reviews can be counted */
export const diffOnlyMark = "diff only: couldn't read the repo"

/**
 * the review's own body: the headline and the reviewer's summary (or why there isn't one); the testing and
 * architecture detail stays in the summary comment. `readRepo` false marks the footer with `diffOnlyMark`
 */
export const reviewBodyOf = ({ headline, summary, reviewer, readRepo = true }: { headline: string; summary?: string; reviewer: Family; readRepo?: boolean }) =>
  [headline, ...(summary ? ["", summary] : []), "", `<sub>Reviewed via ${cliNameOf(reviewer)}${readRepo ? "" : ` · ${diffOnlyMark}`} · testing and architecture are in the Second Look comment</sub>`].join("\n")
