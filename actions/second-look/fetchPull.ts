#!/usr/bin/env node
/**
 * second look, in a dispatched run: fetches the pr it was asked to look at and writes it as a
 * pull_request event (targetOf.ts reads it), so every later step sees the same pr. it refuses
 * repos outside the run's own org, prs that aren't open, and prs that change over 5,000 lines (the last two only
 * for a review: SECOND_LOOK_ANSWERING=true, answering a question, takes any pr in the org).
 * with SECOND_LOOK_HEAD_SHA (what
 * prepare checked out), a pr that has moved on since is still reviewed at that commit.
 *
 *   node fetchPull.ts
 *
 * env: GITHUB_TOKEN (pull-requests: read on the pr's repo), SECOND_LOOK_REPOSITORY, SECOND_LOOK_NUMBER,
 * SECOND_LOOK_EVENT_PATH (where to write it), GITHUB_REPOSITORY_OWNER, optional SECOND_LOOK_HEAD_SHA,
 * GITHUB_API_URL, GITHUB_OUTPUT (gets head-sha and base-sha). for a review it also decides the run's plan (fetchReviewPlan.ts,
 * reviewPlanOf.ts: skip, full or incremental, testers or not, which model) from SECOND_LOOK_SKIP_REPOS,
 * SECOND_LOOK_SKIP_DOCS_ONLY, SECOND_LOOK_INCREMENTAL, SECOND_LOOK_TIERED_MODEL, SECOND_LOOK_SMALL_MODEL and
 * SECOND_LOOK_SMALL_MAX_LINES, and writes it into the event file as `second_look_plan` (GITHUB_OUTPUT gets `skip`).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { maxChangedLines, overLimitOf } from "./changedLinesOf.ts"
import { defaultPlan, fetchReviewPlan, planLineOf } from "./fetchReviewPlan.ts"
import type { PullRequest } from "./types.ts"

/** why second look won't look at this pr; undefined when it will. `answering` a question works on any pr in the org, closed or big */
export const refusalOf = ({ repository, owner, pull, answering = false }: { repository: string; owner: string; pull?: PullRequest; answering?: boolean }) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) return `"${repository}" isn't an owner/name repository`
  if (repository.split("/")[0].toLowerCase() !== owner.toLowerCase()) return `${repository} isn't in ${owner}`
  if (answering) return undefined
  if (pull && pull.state !== "open") return `${repository}#${pull.number} is ${pull.state ?? "not open"}`
  const over = pull ? overLimitOf(pull) : undefined
  if (pull && over !== undefined) return `${repository}#${pull.number} changes ${over} lines, over the ${maxChangedLines} second look will review`
  return undefined
}

/** the pr as reviewed: pinned to `headSha` when one was prepared */
export const pinnedPullOf = (pull: PullRequest, headSha?: string): PullRequest => (headSha && headSha !== pull.head.sha ? { ...pull, head: { ...pull.head, sha: headSha } } : pull)

const main = async () => {
  const repository = process.env.SECOND_LOOK_REPOSITORY ?? ""
  const number = Number(process.env.SECOND_LOOK_NUMBER)
  const owner = process.env.GITHUB_REPOSITORY_OWNER ?? ""
  const early = refusalOf({ repository, owner })
  if (early || !Number.isInteger(number) || number < 1) throw new Error(early ?? `"${process.env.SECOND_LOOK_NUMBER}" isn't a pr number`)
  const api = process.env.GITHUB_API_URL || "https://api.github.com"
  const token = process.env.GITHUB_TOKEN ?? ""
  const get = async (path: string) => {
    const response = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } })
    if (!response.ok) throw new Error(`GET ${path.split("?")[0]} answered ${response.status}`)
    return response.json()
  }
  const fetched = (await get(`/repos/${repository}/pulls/${number}`).catch((error: Error) => {
    throw new Error(`reading ${repository}#${number}: ${error.message}`)
  })) as PullRequest
  const answering = process.env.SECOND_LOOK_ANSWERING === "true"
  const refusal = refusalOf({ repository, owner, pull: fetched, answering })
  if (refusal) throw new Error(refusal)
  const headSha = process.env.SECOND_LOOK_HEAD_SHA
  if (headSha && headSha !== fetched.head.sha) console.log(`::notice title=Second Look (beta)::${repository}#${number} moved to ${fetched.head.sha.slice(0, 7)} after this run started; reviewing ${headSha.slice(0, 7)}`)
  const pull = pinnedPullOf(fetched, headSha)
  const path = process.env.SECOND_LOOK_EVENT_PATH ?? ""
  mkdirSync(dirname(path), { recursive: true })
  const plan = answering ? undefined : await fetchReviewPlan({ get, token, repository, pull }).catch((error: Error) => {
    console.log(`::warning title=Second Look (beta)::couldn't plan the run, so it reviews everything: ${error.message}`)
    return defaultPlan
  })
  if (plan) console.log(planLineOf(plan))
  writeFileSync(path, JSON.stringify({ pull_request: pull, ...(plan ? { second_look_plan: plan } : {}) }))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `head-sha=${pull.head.sha}\nbase-sha=${pull.base.sha}\nskip=${plan?.skip ? "true" : "false"}\n`)
  console.log(`second look: ${repository}#${number} "${pull.title}" at ${pull.head.sha.slice(0, 7)} (base ${pull.base.sha.slice(0, 7)})`)
}

if (import.meta.main) main().catch((error: Error) => {
  console.error(`second look: ${error.message}`)
  process.exit(1)
})
