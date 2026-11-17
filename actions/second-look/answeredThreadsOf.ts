import { conversationTextOf } from "./conversationTextOf.ts"
import { findingOutcomeOf } from "./findingOutcomeOf.ts"
import { findingMarker } from "./inlineCommentsOf.ts"
import type { EarlierThread, PullConversation } from "./types.ts"

const maxThreads = 10

/**
 * second look's resolved inline threads where a person answered last (declined with a reason, said it's fixed,
 * or replied otherwise), with no "Fixed in" reply and no reply from second look since that answer, newest first, at most 10, keyed after the `after`
 * open threads (T4, T5…). the reviewer may reply in one once, to answer their reason; it never reopens it, and a
 * new finding on its line goes there as a reply instead of a second thread (routeFindingsOf.ts). once
 * replied, it's a settled spot (settledSpotsOf.ts) until the person answers again
 */
export const answeredThreadsOf = ({ conversation, author, after }: { conversation: PullConversation; author: string; after: number }): EarlierThread[] =>
  conversation.threads
    .filter((thread) => thread.resolved && thread.comments[0]?.author === author && thread.comments[0].body.includes(findingMarker) && typeof thread.comments[0].databaseId === "number")
    .map((thread) => ({ thread, outcome: findingOutcomeOf(thread, author) }))
    // once second look has replied after the person's last answer, the thread has had its one reply until they answer again
    .filter(({ outcome }) => (outcome.kind === "declined" || outcome.kind === "answered" || outcome.kind === "fixedPerAuthor") && !outcome.repliedAfter)
    .sort((a, b) => b.thread.comments[0].createdAt.localeCompare(a.thread.comments[0].createdAt))
    .slice(0, maxThreads)
    .map(({ thread }, index) => {
      const [first, ...later] = thread.comments
      return {
        key: `T${after + index + 1}`,
        id: thread.id,
        commentId: first.databaseId as number,
        url: first.url ?? "",
        path: thread.path,
        line: thread.line,
        originalLine: thread.originalLine,
        outdated: thread.outdated,
        finding: conversationTextOf(first.body.replace(findingMarker, ""), 1_500),
        replies: later.map((comment) => ({ author: comment.author, body: comment.body })),
        resolvedBy: thread.resolvedBy ?? "someone",
      }
    })
