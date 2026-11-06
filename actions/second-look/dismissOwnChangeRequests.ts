type Review = { id: number; state?: string; user?: { login?: string } | null }

/**
 * after a pass, dismisses `login`'s earlier change requests on the pr. a pass outside the beta scope is only a comment
 * review, and github keeps a reviewer's change request in force until that reviewer approves or it's dismissed, so on
 * `touchless-bot`, where the poster has write, the old block kept a fixed pr unmergeable. the reviews are read every page
 * (oldest first, 100 a page, like issueCommentsOf.ts), and the listing and each dismissal try the tokens in order (the
 * app, then the poster). resolves to the dismissed review ids; throws when the reviews can't be listed or one can't be
 * dismissed
 */
export const dismissOwnChangeRequests = async ({ tokens, repository, number, login, headSha, fetchImpl = fetch }: {
  tokens: string[]
  repository: string
  number: number
  login: string
  headSha: string
  fetchImpl?: typeof fetch
}) => {
  const usable = [...new Set(tokens.filter(Boolean))]
  if (!usable.length) throw new Error(`no token to lift @${login}'s earlier change request; dismiss it on the PR to unblock the merge`)
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" })
  /** the first token's answer that's ok, else the last answer */
  const withTokens = async (url: string, init: RequestInit = {}) => {
    let response: Response | undefined
    for (const token of usable) {
      response = await fetchImpl(url, { ...init, headers: headers(token) })
      if (response.ok) break
    }
    return response as Response
  }
  const pageOf = async (page: number): Promise<Review[]> => {
    const response = await withTokens(`https://api.github.com/repos/${repository}/pulls/${number}/reviews?per_page=100&page=${page}`)
    if (!response.ok) throw new Error(`listing reviews to lift @${login}'s earlier change request answered ${response.status}; dismiss it on the PR to unblock the merge`)
    const reviews = (await response.json()) as Review[]
    return reviews.length === 100 ? [...reviews, ...(await pageOf(page + 1))] : reviews
  }
  const stale = (await pageOf(1)).filter((review) => review.state === "CHANGES_REQUESTED" && review.user?.login?.toLowerCase() === login.toLowerCase())
  const dismissed: number[] = []
  const errors: string[] = []
  for (const { id } of stale) {
    const response = await withTokens(`https://api.github.com/repos/${repository}/pulls/${number}/reviews/${id}/dismissals`, {
      method: "PUT",
      body: JSON.stringify({ event: "DISMISS", message: `Second Look passed on ${headSha.slice(0, 7)}, so this earlier change request no longer stands.` }),
    })
    if (response.ok) dismissed.push(id)
    else errors.push(`review ${id} answered ${response.status}`)
  }
  if (errors.length) throw new Error(`couldn't lift @${login}'s earlier change request (${errors.join("; ")}); dismiss it on the PR to unblock the merge`)
  return dismissed
}
