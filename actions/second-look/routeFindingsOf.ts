import type { InlineComment } from "./inlineCommentsOf.ts"
import type { EarlierThread, Finding } from "./types.ts"

/**
 * keeps a new finding from opening a second thread on a spot that already has an open one: findings on
 * the exact line of a current (not outdated) earlier thread go to `onThread`, as replies there; the rest
 * open new threads
 */
export const routeFindingsOf = ({ inline, threads }: { inline: { finding: Finding; comment: InlineComment }[]; threads: EarlierThread[] }) =>
  inline.reduce<{ fresh: typeof inline; onThread: { thread: EarlierThread; finding: Finding }[] }>((routed, entry) => {
    const thread = threads.find((earlier) => !earlier.outdated && earlier.path === entry.comment.path && earlier.line === entry.comment.line)
    return thread ? { ...routed, onThread: [...routed.onThread, { thread, finding: entry.finding }] } : { ...routed, fresh: [...routed.fresh, entry] }
  }, { fresh: [], onThread: [] })
