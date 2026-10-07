import type { PullRequest } from "./types.ts"

const maxTickets = 3

/**
 * the jira keys a pr points at, in order: its title's `| EXO-1234` suffix, its "Jira Ticket Reference"
 * section, then its branch name (`feat/exo-1234-thing`). only keys in `projects` count, so `UTF-8` or
 * `NO-TICKET` never do.
 */
export const ticketKeysOf = (pull: PullRequest, projects: string[] = ["EXO"]) => {
  const keyPattern = new RegExp(`\\b(${projects.map((project) => project.toUpperCase()).join("|")})-(\\d+)\\b`, "gi")
  const section = /#{2,3}\s*Jira Ticket Reference\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i.exec(pull.body ?? "")?.[1] ?? ""
  const keys = [pull.title, section, pull.head.ref ?? ""].flatMap((text) => [...text.matchAll(keyPattern)].map((match) => `${match[1].toUpperCase()}-${match[2]}`))
  return [...new Set(keys)].slice(0, maxTickets)
}
