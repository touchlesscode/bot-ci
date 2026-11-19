import { changedLinesOf } from "./changedLinesOf.ts"
import { isOff, spendSettings, switchOf } from "./spendSettings.ts"
import type { PullRequest, ReviewPlan } from "./types.ts"

/** second look's spend switches for one run (spendSettings.ts has their defaults and variables) */
export type PlanSettings = {
  /** repos whose prs get no model review (test traffic); `SECOND_LOOK_SKIP_REPOS`, comma list, `none` for none */
  skipRepos: string[]
  /** a pr that only changes docs gets no model review; `SECOND_LOOK_SKIP_DOCS_ONLY` */
  skipDocsOnly: boolean
  /** a re-review looks at what changed since the last reviewed head; `SECOND_LOOK_INCREMENTAL` */
  incremental: boolean
  /** small, low-risk diffs use `smallModel`; `SECOND_LOOK_TIERED_MODEL` */
  tieredModel: boolean
  /** `SECOND_LOOK_SMALL_MODEL` */
  smallModel: string
  /** at most this many changed lines counts as small; `SECOND_LOOK_SMALL_MAX_LINES` */
  smallMaxLines: number
}

/** the switches from their variables, each falling back to spendSettings.ts when blank */
export const planSettingsOf = (environment: NodeJS.ProcessEnv = process.env, defaults = spendSettings): PlanSettings => {
  const repos = (environment.SECOND_LOOK_SKIP_REPOS ?? "").trim()
  const lines = (environment.SECOND_LOOK_SMALL_MAX_LINES ?? "").trim()
  return {
    skipRepos: !repos ? [...defaults.skipRepos] : isOff(repos) ? [] : repos.split(/[\s,]+/).filter(Boolean),
    skipDocsOnly: switchOf(environment.SECOND_LOOK_SKIP_DOCS_ONLY, defaults.skipDocsOnly),
    incremental: switchOf(environment.SECOND_LOOK_INCREMENTAL, defaults.incremental),
    tieredModel: switchOf(environment.SECOND_LOOK_TIERED_MODEL, defaults.tieredModel),
    smallModel: (environment.SECOND_LOOK_SMALL_MODEL ?? "").trim() || defaults.smallModel,
    smallMaxLines: /^\d+$/.test(lines) ? Number(lines) : defaults.smallMaxLines,
  }
}

/**
 * a path that's only prose for people: anything under a top-level `docs/`, and the repo's root README / CHANGELOG.
 * other markdown isn't: in touchless-bot a SKILL.md or AGENTS.md is what a bot runs, `.github/second-look/rules.md`
 * steers this reviewer, and a package's README ships with the package
 */
export const isDocsPath = (path: string) => /^docs\//i.test(path) || /^(README|CHANGELOG)(\.[\w-]+)?\.(md|mdx|txt|rst)$/i.test(path)

const codeExtensions = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|sh|bash|zsh|go|rs|java|kt|kts|swift|rb|php|cs|sql|css|scss|sass|less|html|vue|svelte|astro|graphql|gql|prisma)$/i
const codeFiles = /(^|\/)(package\.json|Dockerfile|Makefile)$/

/** a path a tester could exercise by hand: source code, styles, markup, a package manifest */
export const isRunnablePath = (path: string) => codeExtensions.test(path) || codeFiles.test(path)

/** paths that put a pr at risk tier 2 or near it (riskTiers.ts: edge/runtime, auth, data migrations), plus ci: workflows, actions and the bot's own `infra/bot-ci/` */
export const isHighRiskPath = (path: string) =>
  /(^|[/_.-])(auth|oauth|migrations?|middleware|edge|runtime|security|permissions?|sessions?|crypto|secrets?)([/_.-]|$)/i.test(path) ||
  /^\.github\/workflows\//.test(path) || /^infra\/bot-ci\//.test(path) || /(^|\/)action\.ya?ml$/.test(path)

/** what the github compare api says about the last reviewed head against this one */
export type Comparison = { status: string; mergeCommits: boolean; truncated: boolean; paths: string[]; changedLines: number }

/** the last head second look reviewed on this pr, from its summary comment (reviewedMarkerOf) */
export type LastReview = { sha: string; tier?: number }

const short = (sha: string) => sha.slice(0, 7)

/**
 * the plan for one run. `paths` is every path the pr changes (undefined when it couldn't all be read), `last` the last
 * reviewed head, `comparison` that head against this one (undefined when it couldn't be compared), `restricted` whether
 * the author may raise only tier 0 (then the tier gate rests on the review, so the larger model always reviews)
 */
export const reviewPlanOf = ({ settings, repository, pull, paths, last, comparison, restricted = false }: {
  settings: PlanSettings
  repository: string
  pull: PullRequest
  paths?: string[]
  last?: LastReview
  comparison?: Comparison
  restricted?: boolean
}): ReviewPlan => {
  const name = repository.split("/").at(-1)?.toLowerCase() ?? ""
  const skippedRepo = settings.skipRepos.find((entry) => entry.toLowerCase() === repository.toLowerCase() || entry.toLowerCase() === name)
  if (skippedRepo) return { skip: `${repository} is the e2e sandbox (test traffic), so no model reviews its PRs`, review: "full", testers: "skip", testersReason: "the run is skipped", modelReason: "no model" }
  if (settings.skipDocsOnly && paths?.length && paths.every(isDocsPath)) return { skip: `docs-only change (${paths.length} file${paths.length === 1 ? "" : "s"} under docs/ or the root README), so no model review`, review: "full", testers: "skip", testersReason: "the run is skipped", modelReason: "no model" }

  const head = pull.head.sha
  const full = (fullReason: string) => ({ review: "full" as const, fullReason })
  const scope = !settings.incremental ? full("incremental re-reviews are off")
    : !last ? full("first review")
    : last.sha === head ? full(`the head is the one last reviewed (${short(head)})`)
    : !comparison ? full(`couldn't compare ${short(last.sha)} with ${short(head)}`)
    : comparison.status !== "ahead" ? full(`the head isn't a descendant of the last reviewed head ${short(last.sha)} (${comparison.status}: a force-push or rebase)`)
    : comparison.mergeCommits ? full(`a merge commit landed since the last reviewed head ${short(last.sha)}`)
    : comparison.truncated ? full(`too many changes since ${short(last.sha)} to compare`)
    : { review: "incremental" as const, since: last.sha, ...(last.tier === undefined ? {} : { sinceTier: last.tier }) }

  const incremental = scope.review === "incremental" && comparison
  const testers = incremental && !comparison.paths.some(isRunnablePath)
    ? { testers: "skip" as const, testersReason: `no runnable code changed since the last reviewed head ${short(last!.sha)}` }
    : { testers: "run" as const }

  const scopePaths = incremental ? comparison.paths : paths
  const lines = incremental ? comparison.changedLines : changedLinesOf(pull)
  const risky = scopePaths?.find(isHighRiskPath)
  const keep = (modelReason: string) => ({ modelReason, ...(lines === undefined ? {} : { changedLines: lines }) })
  const model = !settings.tieredModel ? keep("tiered model is off")
    : lines === undefined || !scopePaths ? keep("the diff's size or paths aren't known")
    : lines > settings.smallMaxLines ? keep(`${lines} changed lines, over ${settings.smallMaxLines}`)
    : (last?.tier ?? 0) >= 2 ? keep("the last review put it at risk tier 2")
    : risky ? keep(`touches ${risky} (risk tier 2 territory)`)
    : restricted ? keep("the author can raise only tier 0, so the tier gate rests on this review")
    : { anthropicModel: settings.smallModel, modelReason: `${lines} changed line${lines === 1 ? "" : "s"}, none in risk tier 2 territory`, changedLines: lines }

  return { ...scope, ...testers, ...model }
}

const reviewedPattern = /<!-- second-look-reviewed: ([0-9a-f]{40})(?: tier=(\d))? -->/

/** the hidden line the summary comment carries for the head a run actually reviewed, so the next run can diff from it */
export const reviewedMarkerOf = ({ sha, tier }: LastReview) => `<!-- second-look-reviewed: ${sha}${tier === undefined ? "" : ` tier=${tier}`} -->`

/** the last reviewed head in a summary comment's body, or undefined */
export const lastReviewOf = (body: string | null | undefined): LastReview | undefined => {
  const match = reviewedPattern.exec(body ?? "")
  return match ? { sha: match[1], ...(match[2] === undefined ? {} : { tier: Number(match[2]) }) } : undefined
}
