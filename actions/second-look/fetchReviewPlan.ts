import { readFileSync } from "node:fs"
import { commentMarker } from "./commentBodyOf.ts"
import { issueCommentsOf } from "./issueCommentsOf.ts"
import { appLogin, posterLogin } from "./reviewerLogins.ts"
import { lastReviewOf, planSettingsOf, reviewPlanOf, type Comparison } from "./reviewPlanOf.ts"
import { tierRestrictedAuthors } from "./riskTiers.ts"
import type { PullRequest, ReviewPlan } from "./types.ts"

const maxFilePages = 10
const compareFileCap = 300

type Get = (path: string) => Promise<unknown>

/** every path the pr changes (renames by both names), or undefined past 1,000 files or when a page can't be read */
export const pullPathsOf = async (get: Get, repository: string, number: number): Promise<string[] | undefined> => {
  const paths: string[] = []
  for (let page = 1; page <= maxFilePages; page++) {
    const files = (await get(`/repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`)) as { filename?: string; previous_filename?: string }[]
    for (const file of files) paths.push(...[file.filename, file.previous_filename].filter((path): path is string => Boolean(path)))
    if (files.length < 100) return paths
  }
  return undefined
}

/** the last reviewed head against `head` (github's compare api), or undefined when github can't compare them (an unknown sha) */
export const comparisonOf = async (get: Get, repository: string, base: string, head: string): Promise<Comparison | undefined> => {
  const compared = (await get(`/repos/${repository}/compare/${base}...${head}`).catch(() => undefined)) as
    | { status?: string; commits?: { parents?: unknown[] }[]; files?: { filename?: string; previous_filename?: string; additions?: number; deletions?: number }[]; total_commits?: number }
    | undefined
  if (!compared?.status) return undefined
  const files = compared.files ?? []
  return {
    status: compared.status,
    mergeCommits: (compared.commits ?? []).some((commit) => (commit.parents?.length ?? 1) > 1),
    truncated: files.length >= compareFileCap || (compared.total_commits ?? 0) > (compared.commits?.length ?? 0),
    paths: files.flatMap((file) => [file.filename, file.previous_filename].filter((path): path is string => Boolean(path))),
    changedLines: files.reduce((total, file) => total + (file.additions ?? 0) + (file.deletions ?? 0), 0),
  }
}

/**
 * the run's plan (reviewPlanOf.ts), read through github's api: the pr's files, second look's own summary comment (only
 * clanker-in-chief's or the App's count, so nobody else can plant a "last reviewed" head) and the comparison. a read that
 * fails makes the plan more conservative (a full review, the configured model), never a skip it can't justify
 */
export const fetchReviewPlan = async ({ get, token, repository, pull, environment = process.env, fetchImpl = fetch }: {
  get: Get
  token: string
  repository: string
  pull: PullRequest
  environment?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}): Promise<ReviewPlan> => {
  const settings = planSettingsOf(environment)
  const paths = await pullPathsOf(get, repository, pull.number).catch(() => undefined)
  const comments = await issueCommentsOf({ token, repository, number: pull.number, fetchImpl }).catch(() => [])
  const sticky = comments.filter((comment) => comment.body?.includes(commentMarker) && [posterLogin, appLogin].includes(comment.user?.login ?? "")).at(-1)
  const last = lastReviewOf(sticky?.body)
  const comparison = settings.incremental && last && last.sha !== pull.head.sha ? await comparisonOf(get, repository, last.sha, pull.head.sha) : undefined
  const restricted = tierRestrictedAuthors.some((login) => login.toLowerCase() === (pull.user?.login ?? "").toLowerCase())
  return reviewPlanOf({ settings, repository, pull, paths, last, comparison, restricted })
}

/** a plan for a run whose event file has none (written before this existed, or by a test): review everything, as before */
export const defaultPlan: ReviewPlan = { review: "full", fullReason: "no plan in the event file", testers: "run", modelReason: "no plan" }

/** the plan fetchPull.ts wrote next to the pr in SECOND_LOOK_EVENT_PATH */
export const planOf = (environment: NodeJS.ProcessEnv = process.env): ReviewPlan => {
  try {
    const path = environment.SECOND_LOOK_EVENT_PATH || ""
    return (JSON.parse(readFileSync(path, "utf8")) as { second_look_plan?: ReviewPlan }).second_look_plan ?? defaultPlan
  } catch {
    return defaultPlan
  }
}

/**
 * the plan the reviewer follows. a skip closes the check green, which AI Provenance's beta gate reads as Second Look's
 * approval, so a beta-enabled run is never skipped: it gets a full review on the configured model (prepare, which can't
 * tell a beta run, already skipped its testers)
 */
export const effectivePlanOf = (plan: ReviewPlan, betaEnabled: boolean): ReviewPlan =>
  plan.skip && betaEnabled
    ? { ...plan, skip: undefined, review: "full", fullReason: `in Second Look's scope, so not skipped (${plan.skip})`, testersReason: "the run was planned as a skip", anthropicModel: undefined, modelReason: "review of a planned skip in Second Look's scope" }
    : plan

/**
 * the smaller anthropic model the reviewer may use: the plan sized a re-review by the changes since the last head, so
 * when the reviewer falls back to the whole pr (`diffedSince` false) that sizing doesn't hold and the configured model reviews
 */
export const smallModelOf = (plan: ReviewPlan, diffedSince: boolean) => (plan.review === "incremental" && !diffedSince ? undefined : plan.anthropicModel)

/** the plan in one log line */
export const planLineOf = (plan: ReviewPlan) =>
  plan.skip
    ? `second look plan: skip (${plan.skip})`
    : `second look plan: ${plan.review === "incremental" ? `incremental since ${plan.since?.slice(0, 7)}` : `full (${plan.fullReason})`}; testers ${plan.testers === "run" ? "run" : `skipped (${plan.testersReason})`}; model ${plan.anthropicModel ?? "configured"} (${plan.modelReason})`
