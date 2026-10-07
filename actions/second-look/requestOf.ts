/** the slice of a github issue comment second look reads */
export type IssueComment = {
  id: number
  body?: string | null
  created_at?: string
  html_url?: string
  author_association?: string
  user?: { login?: string; type?: string } | null
}

/** a person asking for (or switching off) a second look */
export type Request = { state: "on" | "off"; by: string; commentId: number }

export const mention = /(^|[^\w/-])@touchless-bot\b/i
const stopWords = /\b(stop|off|pause|cancel|disable)\b/i
const trusted = new Set(["OWNER", "MEMBER", "COLLABORATOR"])

/** whether a comment is an org member's `@touchless-bot …` (bots, including the bot itself, never count) */
export const isRequestComment = (comment: IssueComment) =>
  mention.test(comment.body ?? "") && comment.user?.type !== "Bot" && !(comment.user?.login ?? "").endsWith("[bot]") && trusted.has(comment.author_association ?? "")

/** `@touchless-bot stop` (or off / pause / cancel / disable) switches it off; any other mention is a request */
export const requestStateOf = (body: string): Request["state"] => (stopWords.test(body) ? "off" : "on")

/**
 * the pr's current opt-in: the latest request comment decides, so a request
 * keeps every later push reviewed until someone says stop.
 */
export const requestOf = (comments: IssueComment[]): Request | undefined => {
  const latest = comments.filter(isRequestComment).sort((left, right) => (left.created_at ?? "").localeCompare(right.created_at ?? "") || left.id - right.id).at(-1)
  return latest ? { state: requestStateOf(latest.body ?? ""), by: latest.user?.login ?? "someone", commentId: latest.id } : undefined
}
