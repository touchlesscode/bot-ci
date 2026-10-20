#!/usr/bin/env node
/**
 * what template this repo was made from, for Build's eligibility: the one lookup of repos/<owner>/<name>,
 * shared by the Plan job (actions/ci-plan) and setup.sh's scan (reposWithoutBuild.ts).
 *
 * a template_repository that names a template decides. GitHub leaves it out for a repo made from no template,
 * and also for one made from a template the caller can't see, which is every private-template repo from the
 * Plan job's repo-scoped token. so when it names none, the org's `bot-ci-template` custom property decides
 * (github-new-repo sets it at creation, setup.sh backfills it, and only org owners and the App can change it);
 * without the property, "none" is a verdict only from a token that reads the template itself. anything else —
 * no answer, a non-200, an unreadable body, a malformed field, or none of the above — is unknown, never a verdict.
 *
 * only the state, the statuses, the field enum, the property value and names that matched owner/name ever leave:
 * never the token, the headers, the body or an error's text, so nothing the API returns can write a line of its own.
 *
 *   node templateLineage.ts   (the Plan job, before any checkout: GH_TOKEN, GITHUB_REPOSITORY, BOT_CI_TEMPLATE)
 */
import { appendFileSync } from "node:fs"

/** the only endpoint this is for; not overridable, so no environment can point the token somewhere else */
const api = "https://api.github.com"

/** the org custom property recording which template a repo was made from: the template's repo name, or `none` */
export const templateProperty = "bot-ci-template"

/** the property's value for a repo made from no template, and its default */
export const noTemplate = "none"

/** what a 200's template_repository was */
export type TemplateField = "named" | "absent" | "null" | "empty" | "malformed"

/** why a lineage is unknown; a fixed word, never text from the API */
export type LineageProblem = "no-token" | "repository-name" | "template-name" | "request-failed" | "http-status" | "body" | "template-field" | "template-unreadable"

/**
 * how a verdict was reached: `link` is a template_repository that named one, `property` is the bot-ci-template
 * property, `no-link` is no template named, from a token that reads the template (its own GET answered 200)
 */
export type LineageSource = "link" | "property" | "no-link"

/** what the lookups answered: the repo's status and field, plus the property's and the template's statuses when asked */
export type LineageEvidence = { status: number; field: TemplateField; propertyStatus?: number; templateStatus?: number }

export type Lineage =
  | ({ state: "eligible"; source: "link" | "property"; madeFrom: string } & LineageEvidence)
  | ({ state: "ineligible"; source: "link"; madeFrom: string } & LineageEvidence)
  | ({ state: "ineligible"; source: "property"; recorded: string } & LineageEvidence)
  | ({ state: "ineligible"; source: "no-link" } & LineageEvidence)
  | { state: "unknown"; problem: LineageProblem; status?: number; field?: TemplateField; propertyStatus?: number; templateStatus?: number }

/** a GET's status, and the body only when it's a 200. undefined for no answer */
export type MetadataResponse = { status: number; body?: string } | undefined

/** one GET keyed by owner/name, injected so the decision can be tested without a token or a network */
export type MetadataRequest = (repository: string) => Promise<MetadataResponse> | MetadataResponse

/** the lookups lineageOf makes: `metadata` is repos/<owner>/<name>, `properties` its properties/values */
export type LineageRequests = { metadata: MetadataRequest; properties?: MetadataRequest }

/** owner/name as GitHub allows it: nothing matching this can break a line or a shell word */
const repositoryName = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/

/** a property value safe to print and compare: a repo name or `none` */
const propertyValue = /^[A-Za-z0-9._-]{1,100}$/

export const isRepositoryName = (value: unknown): value is string => typeof value === "string" && repositoryName.test(value)

const unknownLineage = (problem: LineageProblem, evidence: Partial<LineageEvidence> = {}): Lineage => {
  const defined = Object.entries(evidence).filter(([, value]) => value !== undefined)
  return { state: "unknown", problem, ...Object.fromEntries(defined) }
}

/** a name only when it's safe to print; what the caller passed is otherwise unchecked text */
const shown = (value: string) => (isRepositoryName(value) ? value : "a name that isn't owner/name")

/** one GET through `request`: its response, or undefined when it threw or answered without a numeric status */
const responseOf = async (request: MetadataRequest, repository: string): Promise<MetadataResponse> => {
  try {
    const response = await request(repository)
    return response && Number.isInteger(response.status) ? response : undefined
  } catch {
    return undefined
  }
}

/** which of absent / null / empty / malformed / named a 200's template_repository is */
export const templateFieldOf = (metadata: object): { field: TemplateField; madeFrom?: string } => {
  if (!("template_repository" in metadata)) return { field: "absent" }
  const value = (metadata as { template_repository?: unknown }).template_repository
  if (value === null) return { field: "null" }
  if (typeof value !== "object" || Array.isArray(value)) return { field: "malformed" }
  const madeFrom = (value as { full_name?: unknown }).full_name
  if (madeFrom === undefined || madeFrom === null || madeFrom === "") return { field: "empty" }
  if (!isRepositoryName(madeFrom)) return { field: "malformed" }
  return { field: "named", madeFrom }
}

/** the bot-ci-template value in a properties/values body, or undefined when it's unset, unreadable or not a plain name */
export const recordedTemplateOf = (body: string | undefined): string | undefined => {
  let values: unknown
  try {
    values = JSON.parse(body ?? "")
  } catch {
    return undefined
  }
  if (!Array.isArray(values)) return undefined
  const entry = values.find((value): value is { value?: unknown } => typeof value === "object" && value !== null && (value as { property_name?: unknown }).property_name === templateProperty)
  return typeof entry?.value === "string" && propertyValue.test(entry.value) ? entry.value : undefined
}

/**
 * `repository`'s lineage against `template` (both owner/name). nothing turns a failed answer into a verdict: a repo
 * whose template_repository names none is decided by its bot-ci-template property, else by whether the same token
 * reads the template itself, else it's unknown
 */
export const lineageOf = async ({ metadata, properties }: LineageRequests, repository: string, template: string): Promise<Lineage> => {
  if (!isRepositoryName(repository)) return unknownLineage("repository-name")
  if (!isRepositoryName(template)) return unknownLineage("template-name")
  const response = await responseOf(metadata, repository)
  if (!response) return unknownLineage("request-failed")
  const { status } = response
  if (status !== 200) return unknownLineage("http-status", { status })
  let parsed: unknown
  try {
    parsed = JSON.parse(response.body ?? "")
  } catch {
    return unknownLineage("body", { status })
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return unknownLineage("body", { status })
  const { field, madeFrom } = templateFieldOf(parsed)
  if (field === "named" && madeFrom !== undefined) return { state: madeFrom.toLowerCase() === template.toLowerCase() ? "eligible" : "ineligible", source: "link", status, field, madeFrom }
  if (field !== "absent" && field !== "null") return unknownLineage("template-field", { status, field })

  const propertyResponse = properties ? await responseOf(properties, repository) : undefined
  const propertyStatus = propertyResponse?.status
  const recorded = propertyStatus === 200 ? recordedTemplateOf(propertyResponse?.body) : undefined
  if (recorded !== undefined) {
    const [owner, name] = template.split("/")
    const recordsTemplate = repository.split("/")[0].toLowerCase() === owner.toLowerCase() && recorded.toLowerCase() === name.toLowerCase()
    if (recordsTemplate) return { state: "eligible", source: "property", status, field, propertyStatus, madeFrom: template }
    return { state: "ineligible", source: "property", status, field, propertyStatus, recorded }
  }

  const templateStatus = (await responseOf(metadata, template))?.status
  if (templateStatus === 200) return { state: "ineligible", source: "no-link", status, field, templateStatus, ...(propertyStatus === undefined ? {} : { propertyStatus }) }
  return unknownLineage("template-unreadable", { status, field, propertyStatus, templateStatus })
}

const fieldClauses: Record<TemplateField, string> = {
  named: "a template",
  absent: "no template_repository field",
  null: "template_repository null",
  empty: "a template_repository with no name",
  malformed: "a template_repository whose name isn't owner/name",
}

/** what the property lookup came to, for a repo it didn't decide */
const propertyClause = (propertyStatus: number | undefined) => {
  if (propertyStatus === undefined) return `no ${templateProperty} property answer`
  if (propertyStatus === 200) return `no ${templateProperty} property`
  return `no ${templateProperty} property (its lookup answered HTTP ${propertyStatus})`
}

type ProblemDetail = { status?: number; field?: TemplateField; propertyStatus?: number; templateStatus?: number }

const problemClauses: Record<LineageProblem, (lineage: ProblemDetail, template: string) => string> = {
  "no-token": () => "the job passed no token to look it up with",
  "repository-name": () => "GITHUB_REPOSITORY isn't owner/name",
  "template-name": () => "the configured template isn't owner/name",
  "request-failed": () => "the metadata lookup got no answer",
  "http-status": ({ status }) => `the metadata lookup answered HTTP ${status}`,
  body: ({ status }) => `HTTP ${status}, with a body that isn't the repository`,
  "template-field": ({ status, field }) => `HTTP ${status} with ${fieldClauses[field ?? "absent"]}, which can't establish that the repo wasn't made from one`,
  "template-unreadable": ({ status, field, propertyStatus, templateStatus }, template) =>
    `HTTP ${status} with ${fieldClauses[field ?? "absent"]}, ${propertyClause(propertyStatus)}, and this token ${templateStatus === undefined ? "got no answer reading" : `can't read (HTTP ${templateStatus})`} ${template}, so it can't tell a repo made from it from one that wasn't`,
}

/** one safe line for the log, the summary and the scan: only the state, the statuses, the field, the property value and checked names */
export const messageOf = (lineage: Lineage, repository: string, template: string) => {
  const repo = shown(repository)
  const notTemplate = `not ${shown(template)}: Build is only for the bot's repos`
  if (lineage.state === "unknown") {
    return `couldn't establish whether ${repo} was made from ${shown(template)}: ${problemClauses[lineage.problem](lineage, shown(template))} (${lineage.problem}${lineage.field ? `/${lineage.field}` : ""}). Not planning Build, and not recording ineligibility: this one needs an owner (infra/bot-ci/README.md)`
  }
  if (lineage.source === "link") return `${repo} is made from ${lineage.madeFrom} (HTTP ${lineage.status}), ${lineage.state === "eligible" ? "Build is for this repo" : notTemplate}`
  if (lineage.state === "eligible") return `${repo} is recorded as made from ${lineage.madeFrom} (${templateProperty} property; HTTP ${lineage.status} with ${fieldClauses[lineage.field]}), Build is for this repo`
  if (lineage.source === "property") return `${repo} is recorded as made from ${lineage.recorded === noTemplate ? "no template" : lineage.recorded} (${templateProperty}=${lineage.recorded}), ${notTemplate}`
  return `${repo} is made from no template (HTTP ${lineage.status} with ${fieldClauses[lineage.field]}, from a token that reads ${shown(template)}), ${notTemplate}`
}

/**
 * the lineage as step outputs. `eligible` is blank for unknown, never "false": a step that couldn't tell must
 * not hand the next one something that reads like a verdict (planChecks reads a blank as unknown too)
 */
export const outputLinesOf = (lineage: Lineage) => [
  `eligible=${{ eligible: "true", ineligible: "false", unknown: "" }[lineage.state]}`,
  `state=${lineage.state}`,
  `source=${lineage.state === "unknown" ? "" : lineage.source}`,
  `status=${lineage.status ?? ""}`,
  `field=${lineage.field ?? ""}`,
  `property-status=${lineage.propertyStatus ?? ""}`,
  `template-status=${lineage.templateStatus ?? ""}`,
]

/** a GET of `${api}/repos/<owner>/<name>${suffix}` with node's own fetch: a fixed endpoint, no redirects, and the token never printed */
const githubGet = (token: string, suffix: string): MetadataRequest => async (repository) => {
  try {
    const response = await fetch(`${api}/repos/${repository}${suffix}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "bot-ci", "x-github-api-version": "2022-11-28" },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    })
    return { status: response.status, body: response.status === 200 ? await response.text() : undefined }
  } catch {
    return undefined
  }
}

/** the real repos/<owner>/<name> lookup */
export const githubMetadata = (token: string): MetadataRequest => githubGet(token, "")

/** the real repos/<owner>/<name>/properties/values lookup; a job token's Metadata read covers it */
export const githubPropertyValues = (token: string): MetadataRequest => githubGet(token, "/properties/values")

if (import.meta.main) {
  const repository = process.env.GITHUB_REPOSITORY ?? ""
  const template = process.env.BOT_CI_TEMPLATE ?? ""
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ""
  const lineage = token ? await lineageOf({ metadata: githubMetadata(token), properties: githubPropertyValues(token) }, repository, template) : unknownLineage("no-token")
  const message = messageOf(lineage, repository, template)
  if (lineage.state === "unknown") console.error(`Template: ${message}`)
  else console.log(`Template: ${message}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${outputLinesOf(lineage).join("\n")}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Build\nTemplate: ${message}\n`)
  if (lineage.state === "unknown") process.exitCode = 1
}
