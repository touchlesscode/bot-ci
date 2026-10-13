import type { InlineComment } from "./inlineCommentsOf.ts"
import type { ReviewEvent } from "./reviewEventOf.ts"

/**
 * submits one review on `commitId` as `event`, carrying the new inline comments. github answers 422 when the poster
 * can't approve or request changes (its own pr), so that one goes in as a plain comment review instead. a comment
 * review with nothing inline isn't posted. resolves to the review's url and the event it went in as, or undefined
 */
export const postReview = async ({ token, repository, number, commitId, event, comments, body, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  commitId: string
  event: ReviewEvent
  comments: InlineComment[]
  body: string
  fetchImpl?: typeof fetch
}): Promise<{ url: string; event: ReviewEvent } | undefined> => {
  if (event === "COMMENT" && !comments.length) return undefined
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}/reviews`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify({ commit_id: commitId, event, body, comments }),
  })
  if (response.status === 422 && event !== "COMMENT") return postReview({ token, repository, number, commitId, event: "COMMENT", comments, body, fetchImpl })
  if (!response.ok) throw new Error(`posting the review answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return { url: ((await response.json()) as { html_url?: string }).html_url ?? "", event }
}
