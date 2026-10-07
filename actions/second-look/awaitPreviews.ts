#!/usr/bin/env node
/**
 * second look, before a tester starts: waits (up to SECOND_LOOK_PREVIEW_WAIT_MINUTES, default 10) for the head
 * commit's preview deploys to finish, then lists the previews in the pr description and whether each answers.
 * the tester tests against those instead of running the app itself. never fails the job.
 *
 *   node awaitPreviews.ts
 *
 * env: GITHUB_TOKEN (checks + pull-requests read), GITHUB_REPOSITORY, GITHUB_EVENT_PATH, optional GITHUB_API_URL,
 * SECOND_LOOK_PREVIEW_WAIT_MINUTES, SECOND_LOOK_PREVIEWS_FILE (default $RUNNER_TEMP/second-look-inputs/previews.json).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { setTimeout as sleepFor } from "node:timers/promises"
import { pendingPreviewChecksOf, type CheckRun } from "./pendingPreviewChecksOf.ts"
import { previewLinksOf, type PreviewLink } from "./previewLinksOf.ts"

/** a preview and what it answered (an http status, or why it didn't) */
export type ProbedPreview = PreviewLink & { answered: string }

/** what the tester is told about previews */
export type PreviewsFile = { previews: ProbedPreview[]; note: string }

type Get = (path: string) => Promise<unknown>

const pollMs = 30_000
const quietPollsNeeded = 2

/** polls until no preview-producing check is pending for two polls in a row, or the deadline; returns why it stopped */
export const awaitPreviewChecks = async ({ get, repository, sha, waitMs, sleep = (ms: number) => sleepFor(ms), now = () => Date.now() }: { get: Get; repository: string; sha: string; waitMs: number; sleep?: (ms: number) => Promise<unknown>; now?: () => number }) => {
  const deadline = now() + waitMs
  let quietPolls = 0
  let pending: string[] = []
  while (true) {
    const { check_runs: checkRuns = [] } = (await get(`/repos/${repository}/commits/${sha}/check-runs?per_page=100`)) as { check_runs?: CheckRun[] }
    pending = pendingPreviewChecksOf(checkRuns)
    quietPolls = pending.length ? 0 : quietPolls + 1
    if (quietPolls >= quietPollsNeeded) return "the preview deploys for this commit are done"
    if (now() + pollMs > deadline) return `stopped waiting after ${Math.round(waitMs / 60_000)} minutes with ${pending.join(", ")} still running, so a preview may be from an earlier commit or missing`
    await sleep(pollMs)
  }
}

/** a GET or the status it answered */
const probe = async (url: string) => {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) })
    return `HTTP ${response.status}`
  } catch (error) {
    return `no answer (${(error as Error).message})`
  }
}

const main = async () => {
  const output = process.env.SECOND_LOOK_PREVIEWS_FILE || join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-inputs", "previews.json")
  const write = (file: PreviewsFile) => {
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(file, null, 2))
    console.log(`previews: ${file.note}; ${file.previews.map((preview) => `${preview.label} ${preview.url} (${preview.answered})`).join(", ") || "none listed"}`)
  }
  try {
    const repository = process.env.GITHUB_REPOSITORY ?? ""
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request: { number: number; head: { sha: string } } }
    const api = process.env.GITHUB_API_URL || "https://api.github.com"
    const get: Get = async (path) => {
      const response = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`, accept: "application/vnd.github+json" } })
      if (!response.ok) throw new Error(`GET ${path.split("?")[0]} answered ${response.status}`)
      return response.json()
    }
    const waitMs = (Number(process.env.SECOND_LOOK_PREVIEW_WAIT_MINUTES) || 10) * 60_000
    const note = await awaitPreviewChecks({ get, repository, sha: event.pull_request.head.sha, waitMs })
    const { body } = (await get(`/repos/${repository}/pulls/${event.pull_request.number}`)) as { body?: string | null }
    const previews = await Promise.all(previewLinksOf(body).map(async (link) => ({ ...link, answered: await probe(link.url) })))
    write({ previews, note })
  } catch (error) {
    write({ previews: [], note: `couldn't look for previews: ${(error as Error).message}` })
  }
}

if (import.meta.main) await main()
