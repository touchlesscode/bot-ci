import { attestationOf, type Attestation, type CheckRun } from "./attestationOf.ts"
import { everLabeledOf } from "./everLabeledOf.ts"
import type { GithubCall } from "./githubOf.ts"
import { harnessSignalsOf, type PullCommit } from "./harnessSignalsOf.ts"
import { secondLookVerdictOf, type BetaSignals, type SecondLookVerdict } from "./secondLookAdapter.ts"

export type Gathered = { headSha: string; author?: string; harnessSignals: string[]; attestation: Attestation; beta: BetaSignals; verdict: SecondLookVerdict }

type Pull = { head?: { sha?: string }; user?: { login?: string }; labels?: { name?: string }[] }

const maxCommitPages = 3

/**
 * everything AI Provenance decides from, read fresh for the pr's current head
 * with the job token (read-only): its commits (up to github's 250), the check
 * runs and Second Look reviews on the head, its labels and label history, and
 * the repo's `second-look-mode` property (from the event when present).
 * throws when the pr itself can't be read.
 */
export const gatherProvenance = async ({ github, repository, number, appSlug, appId, repoProperties }: { github: GithubCall; repository: string; number: number; appSlug: string; appId?: number; repoProperties?: Record<string, unknown> }): Promise<Gathered> => {
  const pullResponse = await github("GET", `/repos/${repository}/pulls/${number}`)
  if (pullResponse.status !== 200) throw new Error(`reading ${repository}#${number} answered ${pullResponse.status}`)
  const pull = pullResponse.json as Pull
  const headSha = pull.head?.sha ?? ""

  const commits: PullCommit[] = []
  for (let page = 1; page <= maxCommitPages; page += 1) {
    const response = await github("GET", `/repos/${repository}/pulls/${number}/commits?per_page=100&page=${page}`)
    if (response.status !== 200) throw new Error(`listing ${repository}#${number}'s commits answered ${response.status}`)
    const batch = (response.json as { sha: string; commit?: { message?: string } }[]).map((commit) => ({ sha: commit.sha, message: commit.commit?.message ?? "" }))
    commits.push(...batch)
    if (batch.length < 100) break
  }

  const checks = await github("GET", `/repos/${repository}/commits/${headSha}/check-runs?filter=all&per_page=100`)
  const checkRuns: CheckRun[] = checks.status === 200 ? ((checks.json as { check_runs?: CheckRun[] }).check_runs ?? []) : []
  const attestation = attestationOf(checkRuns, headSha, { appSlug, appId })

  const reviewsResponse = await github("GET", `/repos/${repository}/pulls/${number}/reviews?per_page=100`)
  const reviews = reviewsResponse.status === 200 ? (reviewsResponse.json as { user?: { login?: string }; state?: string; commit_id?: string }[]).map((review) => ({ user: review.user?.login ?? "", state: review.state ?? "", commit_id: review.commit_id ?? "" })) : []
  const verdict = secondLookVerdictOf(checkRuns.map((run) => ({ name: run.name, conclusion: run.conclusion, head_sha: run.head_sha, app_slug: run.app?.slug })), reviews, headSha)

  const events = await github("GET", `/repos/${repository}/issues/${number}/events?per_page=100`)
  const recorded = events.status === 200 && everLabeledOf(events.json as { event?: string; label?: { name?: string } }[], "second-look-beta")
  let repoProperty = typeof repoProperties?.["second-look-mode"] === "string" ? (repoProperties["second-look-mode"] as string) : undefined
  if (repoProperty === undefined) {
    const properties = await github("GET", `/repos/${repository}/properties/values`)
    const entry = properties.status === 200 ? (properties.json as { property_name?: string; value?: unknown }[]).find((property) => property.property_name === "second-look-mode") : undefined
    repoProperty = typeof entry?.value === "string" ? entry.value : undefined
  }
  const beta: BetaSignals = { attestationLane: attestation.attested ? attestation.lane : undefined, repoProperty, labels: (pull.labels ?? []).map((label) => label.name ?? ""), recorded }

  return { headSha, author: pull.user?.login, harnessSignals: harnessSignalsOf({ commits, author: pull.user?.login }), attestation, beta, verdict }
}
