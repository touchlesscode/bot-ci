import { findingMarker, type InlineComment } from "./inlineCommentsOf.ts"
import type { ReviewComment } from "./reviewCommentsOf.ts"

/**
 * the inline comments not already on the pr: a re-run after a push drops a finding that an
 * earlier second look comment (by `author`, still on the current diff) already says on the same line
 */
export const freshCommentsOf = ({ comments, existing, author }: { comments: InlineComment[]; existing: ReviewComment[]; author?: string }) => {
  const standing = new Set(existing
    .filter((comment) => comment.body?.includes(findingMarker) && typeof comment.line === "number" && (!author || comment.user?.login === author))
    .map((comment) => `${comment.path}:${comment.line}:${comment.body}`))
  return comments.filter((comment) => !standing.has(`${comment.path}:${comment.line}:${comment.body}`))
}
