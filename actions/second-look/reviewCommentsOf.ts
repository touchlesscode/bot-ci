/** the slice of a github pull request review comment second look reads; `line` is null once the comment is outdated */
export type ReviewComment = { id: number; path?: string; line?: number | null; body?: string | null; user?: { login?: string } | null }

/** every inline review comment on a pr, oldest first, 100 a page */
export const reviewCommentsOf = async ({ token, repository, number, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  fetchImpl?: typeof fetch
}): Promise<ReviewComment[]> => {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" }
  const pageOf = async (page: number): Promise<ReviewComment[]> => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}/comments?per_page=100&page=${page}`, { headers })
    if (!response.ok) throw new Error(`listing review comments answered ${response.status}`)
    const comments = (await response.json()) as ReviewComment[]
    return comments.length === 100 ? [...comments, ...(await pageOf(page + 1))] : comments
  }
  return pageOf(1)
}
