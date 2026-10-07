import { freshCommentsOf } from "./freshCommentsOf.ts"
import type { InlineComment } from "./inlineCommentsOf.ts"
import { reviewCommentsOf } from "./reviewCommentsOf.ts"

const headersOf = (token: string) => ({ authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" })

/**
 * posts the findings that sit on the diff as one `COMMENT` review on `commitId`, skipping ones an
 * earlier run already left on the same line. a submitted review clears a pending review request, and
 * the relay watches that request for re-runs after each push, so when `author` was a requested
 * reviewer it's requested again with `requestToken` (the app's). resolves to the review's url (none when
 * there was nothing new to post) and a warning when the re-request didn't take.
 */
export const postInlineReview = async ({ token, requestToken = token, repository, number, commitId, comments, body, author, fetchImpl = fetch }: {
  token: string
  requestToken?: string
  repository: string
  number: number
  commitId: string
  comments: InlineComment[]
  body: string
  author?: string
  fetchImpl?: typeof fetch
}): Promise<{ url?: string; warning?: string }> => {
  if (!comments.length) return {}
  const api = `https://api.github.com/repos/${repository}/pulls/${number}`
  const fresh = freshCommentsOf({ comments, existing: await reviewCommentsOf({ token, repository, number, fetchImpl }), author })
  if (!fresh.length) return {}
  const pull = await fetchImpl(api, { headers: headersOf(token) })
  const requested = pull.ok && Boolean(author) && ((await pull.json()) as { requested_reviewers?: { login?: string }[] }).requested_reviewers?.some((user) => user.login?.toLowerCase() === author?.toLowerCase())
  const response = await fetchImpl(`${api}/reviews`, { method: "POST", headers: headersOf(token), body: JSON.stringify({ commit_id: commitId, event: "COMMENT", body, comments: fresh }) })
  if (!response.ok) throw new Error(`posting the inline review answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const url = ((await response.json()) as { html_url?: string }).html_url ?? ""
  if (!requested) return { url }
  const again = await fetchImpl(`${api}/requested_reviewers`, { method: "POST", headers: headersOf(requestToken), body: JSON.stringify({ reviewers: [author] }) })
  return again.ok ? { url } : { url, warning: `re-requesting @${author} as reviewer answered ${again.status}; request them again to keep re-reviews after pushes` }
}
