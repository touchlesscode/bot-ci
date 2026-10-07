/** replies under an inline review comment; resolves to the reply's url */
export const replyToThread = async ({ token, repository, number, commentId, body, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  commentId: number
  body: string
  fetchImpl?: typeof fetch
}) => {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/pulls/${number}/comments/${commentId}/replies`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new Error(`replying on comment ${commentId} answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return ((await response.json()) as { html_url?: string }).html_url ?? ""
}
