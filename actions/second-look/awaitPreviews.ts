#!/usr/bin/env node
/**
 * second look, in prepare (before the testers start): waits (up to SECOND_LOOK_PREVIEW_WAIT_MINUTES, default 10) for the head
 * commit's preview deploys to finish, then lists the previews in the pr description and whether each answers,
 * plus the pr's canary release when it has one (packages have no preview; none is required). the tester tests
 * against those instead of running the app itself. never fails the job.
 *
 *   node awaitPreviews.ts
 *
 * the check-runs poll is only a courtesy wait: if it fails (a token without checks read answers 403) the pr description is still read,
 * since that's where the previews are listed.
 *
 * env: GITHUB_TOKEN (pull-requests read on the pr's repo), SECOND_LOOK_CHECKS_TOKEN (optional, checks read; used for the poll, else GITHUB_TOKEN), SECOND_LOOK_EVENT_PATH (the pr, see targetOf.ts), optional GITHUB_API_URL,
 * SECOND_LOOK_PREVIEW_WAIT_MINUTES, SECOND_LOOK_PREVIEWS_FILE (default $RUNNER_TEMP/second-look-inputs/previews.json).
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { setTimeout as sleepFor } from "node:timers/promises"
import { canaryReleaseOf, type CanaryRelease } from "./canaryReleaseOf.ts"
import { pendingPreviewChecksOf, type CheckRun } from "./pendingPreviewChecksOf.ts"
import { previewLinksOf, type PreviewLink } from "./previewLinksOf.ts"
import { planOf } from "./fetchReviewPlan.ts"
import { targetOf } from "./targetOf.ts"

/** a preview and what it answered (an http status, or why it didn't) */
export type ProbedPreview = PreviewLink & { answered: string }

/** a canary release, and whether it was published from the pr's head commit */
export type ListedCanary = CanaryRelease & { fromHead: boolean }

/** what the tester is told about what's deployed or published for this pr: previews, a canary for packages, and dashSignIn.ts's note */
export type PreviewsFile = { previews: ProbedPreview[]; note: string; canary?: ListedCanary; signIn?: { status: "signed-in" | "skipped" | "failed"; note: string; origin?: string; identity?: string } }

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

/** the wait, which never stops the lookup: when the check-runs read fails (403 without checks read) say so and carry on to the pr description */
export const waitForPreviewChecks = async (options: Parameters<typeof awaitPreviewChecks>[0]) => {
  try {
    return await awaitPreviewChecks(options)
  } catch (error) {
    const reason = (error as Error).message
    console.log(`previews: couldn't wait for the preview deploys (${reason}); reading the PR description anyway`)
    return `couldn't tell whether the preview deploys finished (${reason}), so a preview may be from an earlier commit or still deploying`
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
    if (file.canary) console.log(`canary: ${file.canary.packages.join(" ")}${file.canary.fromHead ? " (from the head commit)" : " (from an earlier commit)"}`)
  }
  // nothing will test the previews (a skipped run, or a re-review with no runnable change), so don't wait for them
  const plan = planOf()
  if (plan.testers === "skip") return write({ previews: [], note: `didn't wait for previews: the testers are skipped (${plan.skip ?? plan.testersReason})` })
  try {
    const { repository, pull } = targetOf()
    const api = process.env.GITHUB_API_URL || "https://api.github.com"
    const getWith = (token: string): Get => async (path) => {
      const response = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } })
      if (!response.ok) throw new Error(`GET ${path.split("?")[0]} answered ${response.status}`)
      return response.json()
    }
    const get = getWith(process.env.GITHUB_TOKEN ?? "")
    const getChecks = getWith(process.env.SECOND_LOOK_CHECKS_TOKEN || process.env.GITHUB_TOKEN || "")
    const waitMs = (Number(process.env.SECOND_LOOK_PREVIEW_WAIT_MINUTES) || 10) * 60_000
    const note = await waitForPreviewChecks({ get: getChecks, repository, sha: pull.head.sha, waitMs })
    const { body } = (await get(`/repos/${repository}/pulls/${pull.number}`)) as { body?: string | null }
    const previews = await Promise.all(previewLinksOf(body).map(async (link) => ({ ...link, answered: await probe(link.url) })))
    const canary = canaryReleaseOf(body)
    write({ previews, note, ...(canary ? { canary: { ...canary, fromHead: canary.publishedSha === pull.head.sha } } : {}) })
  } catch (error) {
    write({ previews: [], note: `couldn't look for previews: ${(error as Error).message}` })
  }
}

if (import.meta.main) await main()
