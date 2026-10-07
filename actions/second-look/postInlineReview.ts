import type { InlineComment } from "./inlineCommentsOf.ts"

/** posts new findings as one `COMMENT` review on `commitId`; resolves to its url, or undefined when there's nothing to post */
export const postInlineReview = async ({ token, repository, number, commitId, comments, body, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  commitId: string
  comments: InlineComment[]
  body: string
  fetchImpl?: typeof fetch
}) => {
  if (!comments.length) return undefined
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}/reviews`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify({ commit_id: commitId, event: "COMMENT", body, comments }),
  })
  if (!response.ok) throw new Error(`posting the inline review answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return ((await response.json()) as { html_url?: string }).html_url ?? ""
}
