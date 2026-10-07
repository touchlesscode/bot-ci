import { textOfHtml } from "./textOfHtml.ts"

type Named = { name?: string } | null | undefined
type LinkedIssue = { key: string; fields?: { summary?: string; status?: Named } }

/** the slice of a jira issue (with renderedFields) second look reads */
export type JiraIssue = {
  key: string
  fields: {
    summary?: string
    status?: Named
    issuetype?: Named
    priority?: Named
    labels?: string[]
    parent?: LinkedIssue
    issuelinks?: { type?: { inward?: string; outward?: string }; inwardIssue?: LinkedIssue; outwardIssue?: LinkedIssue }[]
  }
  renderedFields?: { description?: string | null; comment?: { comments?: { author?: { displayName?: string }; created?: string; body?: string }[] } }
}

/** a ticket as the reviewer reads it, plus its raw text for finding figma links */
export type TicketContext = { key: string; markdown: string; text: string }

/** GET a jira rest path as the bot's jira user; throws on a non-2xx */
export type JiraGet = (path: string) => Promise<unknown>

const fields = "summary,status,issuetype,priority,labels,parent,issuelinks,comment,description"
const maxDescriptionChars = 12_000
const maxComments = 10
const maxCommentChars = 2_000

const capped = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…(cut)` : text)
const linkedLineOf = (relation: string, issue: LinkedIssue) => `- ${relation} ${issue.key}: ${issue.fields?.summary ?? ""}${issue.fields?.status?.name ? ` (${issue.fields.status.name})` : ""}`

/** one issue (and its parent, when it has one) as markdown for the reviewer */
export const ticketMarkdownOf = (issue: JiraIssue, parent?: JiraIssue) => {
  const description = textOfHtml(issue.renderedFields?.description)
  const comments = (issue.renderedFields?.comment?.comments ?? []).slice(-maxComments)
  const links = (issue.fields.issuelinks ?? []).flatMap((link) =>
    link.outwardIssue ? [linkedLineOf(link.type?.outward ?? "relates to", link.outwardIssue)] : link.inwardIssue ? [linkedLineOf(link.type?.inward ?? "relates to", link.inwardIssue)] : [])
  return [
    `### ${issue.key}: ${issue.fields.summary ?? "(no summary)"}`,
    [issue.fields.issuetype?.name, issue.fields.status?.name && `status ${issue.fields.status.name}`, issue.fields.priority?.name && `priority ${issue.fields.priority.name}`, issue.fields.labels?.length && `labels ${issue.fields.labels.join(", ")}`].filter(Boolean).join(" · "),
    "",
    capped(description || "(no description)", maxDescriptionChars),
    ...(parent ? ["", `**Parent ${parent.key}: ${parent.fields.summary ?? ""}**`, capped(textOfHtml(parent.renderedFields?.description) || "(no description)", maxDescriptionChars / 2)] : []),
    ...(links.length ? ["", "**Linked issues**", ...links] : []),
    ...(comments.length ? ["", `**Comments** (last ${comments.length})`, ...comments.map((comment) => `- ${comment.author?.displayName ?? "someone"}, ${comment.created?.slice(0, 10) ?? ""}: ${capped(textOfHtml(comment.body), maxCommentChars)}`)] : []),
  ].join("\n")
}

/** reads a ticket and its parent; the raw text keeps urls (figma links) the markdown may have cut */
export const jiraTicketOf = async ({ get, key }: { get: JiraGet; key: string }): Promise<TicketContext> => {
  const issue = (await get(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}&expand=renderedFields`)) as JiraIssue
  const parent = issue.fields.parent ? ((await get(`/rest/api/3/issue/${encodeURIComponent(issue.fields.parent.key)}?fields=summary,status,issuetype,description&expand=renderedFields`).catch(() => undefined)) as JiraIssue | undefined) : undefined
  const raw = [issue.renderedFields?.description ?? "", ...(issue.renderedFields?.comment?.comments ?? []).map((comment) => comment.body ?? ""), parent?.renderedFields?.description ?? ""].join("\n")
  return { key, markdown: ticketMarkdownOf(issue, parent), text: raw }
}
