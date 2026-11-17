import { stickyCommentOf } from "./stickyCommentOf.ts"

/**
 * creates or updates the one pr comment that carries `marker`, so a push edits
 * the last second look instead of stacking a new one. with `author`, only that
 * login's comment counts (a token can't edit another account's). `body` can be built
 * from the comment it replaces (its hidden ledger, ledgerOf.ts), read in the same call. returns the comment url.
 */
export const postStickyComment = async ({ token, repository, number, body, marker, author, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  body: string | ((existing: string | undefined) => string)
  marker: string
  author?: string
  fetchImpl?: typeof fetch
}) => {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" }
  const api = `https://api.github.com/repos/${repository}`
  const existing = await stickyCommentOf({ token, repository, number, marker, author, fetchImpl })
  const text = typeof body === "string" ? body : body(existing?.body ?? undefined)
  const response = existing
    ? await fetchImpl(`${api}/issues/comments/${existing.id}`, { method: "PATCH", headers, body: JSON.stringify({ body: text }) })
    : await fetchImpl(`${api}/issues/${number}/comments`, { method: "POST", headers, body: JSON.stringify({ body: text }) })
  if (!response.ok) throw new Error(`${existing ? "updating" : "creating"} the comment answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return ((await response.json()) as { html_url?: string }).html_url ?? ""
}
