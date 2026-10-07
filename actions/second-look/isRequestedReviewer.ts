/** whether `login` is a pending requested reviewer on the pr; false when the pr can't be read */
export const isRequestedReviewer = async ({ token, repository, number, login, fetchImpl = fetch }: { token: string; repository: string; number: number; login: string; fetchImpl?: typeof fetch }) => {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } })
  if (!response.ok) return false
  const { requested_reviewers: requested = [] } = (await response.json()) as { requested_reviewers?: { login?: string }[] }
  return requested.some((user) => user.login?.toLowerCase() === login.toLowerCase())
}
