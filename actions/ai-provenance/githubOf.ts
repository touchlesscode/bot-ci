export type GithubCall = (method: "GET" | "POST", path: string, body?: unknown) => Promise<{ status: number; json: any }>

/** a minimal github rest client with the job token; network failures resolve as status 0 */
export const githubOf = (token: string, apiUrl = "https://api.github.com", fetchImpl: typeof fetch = fetch): GithubCall => async (method, path, body) => {
  try {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null }
  } catch {
    return { status: 0, json: null }
  }
}
