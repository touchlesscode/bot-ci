/** the slice of a github issue comment second look reads */
export type IssueComment = { id: number; body?: string | null; user?: { login?: string } | null }

/** every comment on a pr's conversation (issue comments), oldest first, 100 a page */
export const issueCommentsOf = async ({ token, repository, number, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  fetchImpl?: typeof fetch
}): Promise<IssueComment[]> => {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" }
  const pageOf = async (page: number): Promise<IssueComment[]> => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`, { headers })
    if (!response.ok) throw new Error(`listing comments answered ${response.status}`)
    const comments = (await response.json()) as IssueComment[]
    return comments.length === 100 ? [...comments, ...(await pageOf(page + 1))] : comments
  }
  return pageOf(1)
}
