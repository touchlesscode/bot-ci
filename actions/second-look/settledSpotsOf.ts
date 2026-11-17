import { findingOutcomeOf } from "./findingOutcomeOf.ts"
import { fingerprintIn } from "./lineFingerprint.ts"
import { findingMarker } from "./inlineCommentsOf.ts"
import type { PullConversation, SettledSpot } from "./types.ts"

/**
 * the lines where second look already gave a person its one reply: its own resolved thread, a person's answer,
 * then a reply from `author` after it, on a line that's still in the diff. `changed` compares the fingerprint that
 * reply carries with the code there now (`fingerprintAt`). a reply that carries no fingerprint (one posted before
 * replies carried them) can't be compared, and neither can a line the head no longer has, so neither is settled: a
 * finding there is weighed like any other
 */
export const settledSpotsOf = ({ conversation, author, fingerprintAt }: {
  conversation: PullConversation
  author: string
  fingerprintAt: (path: string, line: number) => string | undefined
}): SettledSpot[] =>
  conversation.threads.flatMap((thread) => {
    const first = thread.comments[0]
    if (!thread.resolved || thread.outdated || thread.line === null || first?.author !== author || !first.body.includes(findingMarker)) return []
    const outcome = findingOutcomeOf(thread, author)
    if (!("repliedAfter" in outcome) || !outcome.repliedAfter) return []
    const replied = thread.comments.filter((comment) => comment.author === author).at(-1)
    const then = replied ? fingerprintIn(replied.body) : undefined
    if (!then) return []
    const now = fingerprintAt(thread.path, thread.line)
    // the code there can't be read at the head (file gone, line past its end): nothing to compare, so not settled either
    if (!now) return []
    return [{ path: thread.path, line: thread.line, changed: then !== now, url: first.url ?? "" }]
  })
