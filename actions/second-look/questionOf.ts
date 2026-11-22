/** where a question was asked: the pr's conversation, or an inline review thread */
export type QuestionKind = "issue" | "review"

/** the slice of a github issue or review comment a question is read from */
export type QuestionComment = {
  id: number
  body?: string | null
  html_url?: string
  created_at?: string
  user?: { login?: string } | null
  in_reply_to_id?: number
  path?: string
  line?: number | null
  original_line?: number | null
  diff_hunk?: string
}

/** one earlier message around a question, oldest first */
export type QuestionMessage = { author: string; body: string }

/**
 * a question for second look to answer: who asked, what, where, and what came before it there (the inline
 * thread, or the conversation's last few comments). `replyTo` is where the answer goes: the thread's first
 * comment for a review thread (github only takes replies to that), else the question itself
 */
export type Question = {
  kind: QuestionKind
  commentId: number
  replyTo: number
  author: string
  body: string
  url: string
  path?: string
  line?: number | null
  diffHunk?: string
  before: QuestionMessage[]
}

const conversationLength = 12
const maxMessageChars = 4_000

const messageOf = (comment: QuestionComment): QuestionMessage => ({ author: comment.user?.login ?? "someone", body: (comment.body ?? "").slice(0, maxMessageChars) })

/**
 * the question comment `commentId` among `comments` (the pr's issue comments for `issue`, its review comments for
 * `review`), with what came before it; undefined when it isn't there
 */
export const questionOf = ({ kind, commentId, comments }: { kind: QuestionKind; commentId: number; comments: QuestionComment[] }): Question | undefined => {
  const asked = comments.find((comment) => comment.id === commentId)
  if (!asked) return undefined
  const base = { kind, commentId, author: asked.user?.login ?? "someone", body: (asked.body ?? "").slice(0, maxMessageChars), url: asked.html_url ?? "" }
  if (kind === "issue") {
    const index = comments.indexOf(asked)
    return { ...base, replyTo: commentId, before: comments.slice(Math.max(0, index - conversationLength), index).map(messageOf) }
  }
  const root = asked.in_reply_to_id ?? asked.id
  const first = comments.find((comment) => comment.id === root) ?? asked
  const thread = comments.filter((comment) => (comment.id === root || comment.in_reply_to_id === root) && comment.id < asked.id)
  return { ...base, replyTo: root, path: first.path, line: first.line ?? first.original_line ?? null, diffHunk: first.diff_hunk, before: thread.map(messageOf) }
}
