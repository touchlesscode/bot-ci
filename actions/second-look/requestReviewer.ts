/**
 * requests `login`'s review on the pr. second look's inline review and thread replies count as a
 * submitted review, which clears a pending request the relay watches for re-runs, so it's put back after.
 */
export const requestReviewer = async ({ token, repository, number, login, fetchImpl = fetch }: { token: string; repository: string; number: number; login: string; fetchImpl?: typeof fetch }) => {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}/requested_reviewers`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify({ reviewers: [login] }),
  })
  if (!response.ok) throw new Error(`re-requesting @${login} as reviewer answered ${response.status}; request them again to keep re-reviews after pushes`)
}
