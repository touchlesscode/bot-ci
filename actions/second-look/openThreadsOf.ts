import { findingMarker } from "./inlineCommentsOf.ts"
import type { EarlierThread, PullConversation } from "./types.ts"

/** a finding comment's text without second look's marker and header line */
const findingTextOf = (body: string) => body.replace(findingMarker, "").replace(/^\s*\*\*Second Look \(beta\)\*\*[^\n]*\n+/, "").trim()

/**
 * the unresolved inline threads second look started on a pr (first comment by `author`, with the finding
 * marker), outdated ones included: those are where a fix most likely landed. keyed T1, T2… for the reviewer's
 * prompt, with every later reply so it can answer people. pure: read from the pr's `conversation` (conversationOf.ts)
 */
export const openThreadsOf = ({ conversation, author }: { conversation: PullConversation; author: string }): EarlierThread[] =>
  conversation.threads
    // a first comment github gave no id for can't be replied to: left out, as answeredThreadsOf does
    .filter((thread) => !thread.resolved && thread.comments[0]?.author === author && thread.comments[0].body.includes(findingMarker) && typeof thread.comments[0].databaseId === "number")
    .map((thread, index) => {
      const [first, ...later] = thread.comments
      return {
        key: `T${index + 1}`,
        id: thread.id,
        commentId: first.databaseId!,
        url: first.url ?? "",
        path: thread.path,
        line: thread.line,
        originalLine: thread.originalLine,
        outdated: thread.outdated,
        finding: findingTextOf(first.body),
        replies: later.map((comment) => ({ author: comment.author, body: comment.body })),
      }
    })
