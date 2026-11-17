import type { InlineComment } from "./inlineCommentsOf.ts"
import type { EarlierThread, Finding, SettledSpot } from "./types.ts"

type Entry = { finding: Finding; comment: InlineComment }

/**
 * keeps a new finding from opening a second thread on a spot that already has one: findings on the exact line
 * of a current (not outdated) earlier thread go to `onThread`, as replies there; findings on a `settled` spot
 * (second look already gave a person's answer its one reply, settledSpotsOf.ts) are `dropped` as repeats unless
 * the code there changed since; the rest open new threads
 */
export const routeFindingsOf = ({ inline, threads, settled = [] }: { inline: Entry[]; threads: EarlierThread[]; settled?: SettledSpot[] }) =>
  inline.reduce<{ fresh: Entry[]; onThread: { thread: EarlierThread; finding: Finding }[]; dropped: { spot: SettledSpot; finding: Finding }[] }>((routed, entry) => {
    const thread = threads.find((earlier) => !earlier.outdated && earlier.path === entry.comment.path && earlier.line === entry.comment.line)
    if (thread) return { ...routed, onThread: [...routed.onThread, { thread, finding: entry.finding }] }
    const spot = settled.find((candidate) => !candidate.changed && candidate.path === entry.comment.path && candidate.line === entry.comment.line)
    return spot ? { ...routed, dropped: [...routed.dropped, { spot, finding: entry.finding }] } : { ...routed, fresh: [...routed.fresh, entry] }
  }, { fresh: [], onThread: [], dropped: [] })
