import { techLeads, tierOverrideLabel } from "./riskTiers.ts"

/** the slice of a github issue event this reads */
export type LabelEvent = { event: string; actor?: { login?: string } | null; label?: { name?: string } | null }

/**
 * the tech lead whose override stands, from a pr's issue events (oldest first): the override label's latest add or
 * removal decides, and it counts only when it's an add by a tech lead. undefined when there's none, it was removed,
 * or the latest add was by anyone else, so the author can't override themselves by adding it
 */
export const tierOverrideOf = (events: readonly LabelEvent[]): string | undefined => {
  const latest = events.filter(({ event, label }) => (event === "labeled" || event === "unlabeled") && label?.name === tierOverrideLabel).at(-1)
  const login = latest?.actor?.login
  if (latest?.event !== "labeled" || !login) return undefined
  return techLeads.find((lead) => lead.toLowerCase() === login.toLowerCase())
}
