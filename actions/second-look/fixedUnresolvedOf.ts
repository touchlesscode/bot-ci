import { findingMarker } from "./inlineCommentsOf.ts"
import { replyMarker } from "./threadReplyOf.ts"
import type { ConversationThread, PullConversation } from "./types.ts"

/** second look's own "**Fixed** in `abc1234`" reply */
const fixedReply = /\*\*Fixed\*\* in `[0-9a-f]{7,40}`/

/**
 * second look's own threads (first comment by `author`, with the finding marker) that are still unresolved though
 * its "Fixed in" reply is the last word in them: an earlier run called the finding fixed and github refused the
 * resolve. a later run only resolves these (resolveLeftOpen.ts): it doesn't judge them or reply again. once anyone
 * replies after that "Fixed in", the thread is an open one again (openThreadsOf.ts)
 */
export const fixedUnresolvedOf = ({ conversation, author }: { conversation: PullConversation; author: string }): ConversationThread[] =>
  conversation.threads.filter((thread) => {
    const first = thread.comments[0]
    const last = thread.comments.at(-1)
    return !thread.resolved && thread.comments.length > 1 && first?.author === author && first.body.includes(findingMarker)
      && last?.author === author && last.body.includes(replyMarker) && fixedReply.test(last.body)
  })
