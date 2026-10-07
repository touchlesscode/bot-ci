import { findingMarker, type InlineComment } from "./inlineCommentsOf.ts"
import type { ReviewComment } from "./reviewCommentsOf.ts"

/** how far apart two comments on the same file can be and still count as the same spot */
export const nearbyLines = 3

/**
 * the inline comments not already on the pr: a re-run drops a finding when an earlier second look
 * comment (by `author`, still on the current diff) sits on the same file within `nearbyLines`. the
 * reviewer words a finding differently every run, so matching the text would post it again; a dropped
 * one still shows in the summary comment.
 */
export const freshCommentsOf = ({ comments, existing, author }: { comments: InlineComment[]; existing: ReviewComment[]; author?: string }) => {
  const standing = existing.filter((comment) => comment.body?.includes(findingMarker) && typeof comment.line === "number" && (!author || comment.user?.login === author))
  return comments.filter((comment) => !standing.some((earlier) => earlier.path === comment.path && Math.abs((earlier.line as number) - comment.line) <= nearbyLines))
}
