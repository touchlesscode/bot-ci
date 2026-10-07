#!/usr/bin/env node
/**
 * second look, in a dispatched run: fetches the pr it was asked to look at and writes it as a
 * pull_request event (targetOf.ts reads it), so every later step sees the same pr. it refuses
 * repos outside the run's own org and prs that aren't open. with SECOND_LOOK_HEAD_SHA (what
 * prepare checked out), a pr that has moved on since is still reviewed at that commit.
 *
 *   node fetchPull.ts
 *
 * env: GITHUB_TOKEN (pull-requests: read on the pr's repo), SECOND_LOOK_REPOSITORY, SECOND_LOOK_NUMBER,
 * SECOND_LOOK_EVENT_PATH (where to write it), GITHUB_REPOSITORY_OWNER, optional SECOND_LOOK_HEAD_SHA,
 * GITHUB_API_URL, GITHUB_OUTPUT (gets head-sha and base-sha).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { PullRequest } from "./types.ts"

/** why second look won't look at this pr; undefined when it will */
export const refusalOf = ({ repository, owner, pull }: { repository: string; owner: string; pull?: PullRequest }) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) return `"${repository}" isn't an owner/name repository`
  if (repository.split("/")[0].toLowerCase() !== owner.toLowerCase()) return `${repository} isn't in ${owner}`
  if (pull && pull.state !== "open") return `${repository}#${pull.number} is ${pull.state ?? "not open"}`
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
  const response = await fetch(`${api}/repos/${repository}/pulls/${number}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`, accept: "application/vnd.github+json" } })
  if (!response.ok) throw new Error(`reading ${repository}#${number} answered ${response.status}`)
  const fetched = (await response.json()) as PullRequest
  const refusal = refusalOf({ repository, owner, pull: fetched })
  if (refusal) throw new Error(refusal)
  const headSha = process.env.SECOND_LOOK_HEAD_SHA
  if (headSha && headSha !== fetched.head.sha) console.log(`::notice title=Second Look (beta)::${repository}#${number} moved to ${fetched.head.sha.slice(0, 7)} after this run started; reviewing ${headSha.slice(0, 7)}`)
  const pull = pinnedPullOf(fetched, headSha)
  const path = process.env.SECOND_LOOK_EVENT_PATH ?? ""
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ pull_request: pull }))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `head-sha=${pull.head.sha}\nbase-sha=${pull.base.sha}\n`)
  console.log(`second look: ${repository}#${number} "${pull.title}" at ${pull.head.sha.slice(0, 7)} (base ${pull.base.sha.slice(0, 7)})`)
}

if (import.meta.main) main().catch((error: Error) => {
  console.error(`second look: ${error.message}`)
  process.exit(1)
})
