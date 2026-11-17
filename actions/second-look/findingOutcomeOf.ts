import type { ConversationThread, FindingOutcome } from "./types.ts"

/**
 * a person's reply that says the point was dealt with in the code. "resolved", "updated" and "changed" count only
 * when they stand alone or name what changed ("Changed it to…", "Updated the guard"), so "Changed my mind, leaving
 * it" is an answer, not a fix
 */
const fixedClaim = /^\W*(?:(?:fixed|done|addressed)\b|(?:resolved|updated|changed)(?:\s*$|\s*[.,:;!)]|\s+(?:it|this|that|the|to|in|here|now)\b))/i

/**
 * a person's reply that keeps the code as it is, with a reason, or moves the work to another pr: whole phrases
 * only, so "not what I expected, will fix" or "a follow-up commit fixes it" aren't read as declines. anything
 * else is an answer, which the digest quotes anyway
 */
const declineClaim = /\b(on purpose|intentional(ly)?|by design|deliberate(ly)?|won'?t (fix|change)|not (going|planning) to (fix|change)|leav(e|ing) (this|it) as is|keep(ing)? (this|it) as is|we(?:'ll| will)? keep (?:it|this|that|the)|(in|as|to|for) a (future|separate|later|follow[- ]?up) pr|out of scope|not in scope|works as (expected|intended)|(this|that) is expected)\b/i

/** the sha in second look's own "**Fixed** in `abc1234`" reply */
const fixedReplyPattern = /\*\*Fixed\*\* in `([0-9a-f]{7,40})`/

/**
 * what became of one of second look's own inline findings (`thread`, first comment by `reviewer`): fixed (its
 * own "Fixed in" reply), open (unresolved), or, once resolved, what the last person to reply said: that it's
 * fixed, a decline with their reason, another answer; or resolved with no reply (superseded when the code moved).
 * `repliedAfter` says second look already answered that person's last reply
 */
export const findingOutcomeOf = (thread: ConversationThread, reviewer: string): FindingOutcome => {
  const later = thread.comments.slice(1)
  const fixed = later.map((comment) => (comment.author === reviewer ? fixedReplyPattern.exec(comment.body)?.[1] : undefined)).filter(Boolean).at(-1)
  if (fixed) return { kind: "fixed", sha: fixed }
  if (!thread.resolved) return { kind: "open" }
  const answerIndex = later.findLastIndex((comment) => comment.author !== reviewer && !comment.author.endsWith("[bot]"))
  if (answerIndex < 0) return { kind: thread.outdated ? "superseded" : "resolved", resolvedBy: thread.resolvedBy }
  const words = later[answerIndex].body.trim()
  // a decline phrase wins over a fix claim: "Addressed in a follow-up PR" keeps the code as it is
  const kind = declineClaim.test(words) ? "declined" : fixedClaim.test(words) ? "fixedPerAuthor" : "answered"
  const repliedAfter = later.slice(answerIndex + 1).some((comment) => comment.author === reviewer)
  return { kind, by: later[answerIndex].author, words, resolvedBy: thread.resolvedBy, repliedAfter }
}
