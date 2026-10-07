/** creates a check run on `repository` (no `id`) or updates one; returns its id */
export const sendCheckRun = async ({ token, repository, id, body, fetchImpl = fetch }: { token: string; repository: string; id?: string; body: object; fetchImpl?: typeof fetch }) => {
  const api = `${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${repository}/check-runs`
  const response = await fetchImpl(id ? `${api}/${id}` : api, {
    method: id ? "PATCH" : "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${id ? "updating" : "creating"} the check answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return String(((await response.json()) as { id?: number }).id ?? id ?? "")
}
