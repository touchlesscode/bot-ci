import type { LabelEvent } from "./tierOverrideOf.ts"

/** a pr's issue events, every page (100 each, up to 10 pages), oldest first */
export const labelEventsOf = async ({ token, repository, number, api = process.env.GITHUB_API_URL || "https://api.github.com" }: { token: string; repository: string; number: number; api?: string }): Promise<LabelEvent[]> => {
  const events: LabelEvent[] = []
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${api}/repos/${repository}/issues/${number}/events?per_page=100&page=${page}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } })
    if (!response.ok) throw new Error(`reading ${repository}#${number}'s events answered ${response.status}`)
    const batch = (await response.json()) as LabelEvent[]
    events.push(...batch)
    if (batch.length < 100) break
  }
  return events
}
