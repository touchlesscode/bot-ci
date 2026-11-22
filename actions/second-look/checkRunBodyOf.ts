import { providerErrorLineOf } from "./providerErrorOf.ts"
import type { ProviderError, Verdict } from "./types.ts"

/** the check second look puts on a pr it reviews, named like the old required check */
export const checkName = "Second Look (beta)"

/** the `external_id` of a beta-enabled run's check, so a gate can tell it from an informational one (infra/bot-ci/actions/second-look/betaScopeNames.ts) */
export const betaExternalId = "second-look-beta"

/**
 * the body that opens the check on the pr's head while the review runs. a beta-enabled run's check carries
 * `betaExternalId` and says its verdict counts
 */
export const checkStartOf = ({ headSha, detailsUrl, requestedBy, betaEnabled = false }: { headSha: string; detailsUrl: string; requestedBy?: string; betaEnabled?: boolean }) => ({
  name: checkName,
  head_sha: headSha,
  status: "in_progress",
  details_url: detailsUrl,
  ...(betaEnabled ? { external_id: betaExternalId } : {}),
  output: {
    title: betaEnabled ? "Reviewing (beta scope)" : "Reviewing",
    summary: `${requestedBy ? `Requested by @${requestedBy}. ` : ""}An OpenAI and an Anthropic tester try the PR's test plan by hand (on its previews, canary packages or a sandbox build), then a main reviewer checks the change against its ticket and the repo's docs. The review lands as a comment on the PR in about 20-30 minutes.${betaEnabled ? " This PR is in Second Look's beta scope, so the review approves or requests changes and this check goes green or red. A person still approves the merge." : ""}`,
  },
})

/**
 * the body that closes the check with the review's outcome. outside the beta scope the check is informational: a pass
 * is green ("no changes requested", never an approval) and anything else neutral, never red. on a beta-enabled pr it
 * enforces: a pass is an approval and a block (the review requests changes either way) is red. a review that
 * couldn't finish is neutral in both, like an abandoned run: it judged nothing, and red would read as changes requested.
 * the exception is a provider outage (`outage`: the reviewer's model refused on credit, quota or its key): with
 * `outageRed` (SECOND_LOOK_OUTAGE_RED, on unless `off`) that closes the check red, "Didn't review", everywhere, because a
 * neutral check passes branch protection and reads as nothing wrong while nobody reviewed anything
 */
export const checkEndOf = ({ verdict, error, betaEnabled, commentUrl, outage, outageRed = false }: { verdict?: Verdict; error?: string; betaEnabled: boolean; commentUrl?: string; outage?: ProviderError; outageRed?: boolean }) => {
  const link = commentUrl ? `\n\n[The review](${commentUrl})` : ""
  const notPassing = betaEnabled ? "failure" : "neutral"
  if (!verdict && outage) return { status: "completed", conclusion: outageRed ? "failure" : "neutral", output: { title: `Didn't review: ${outage.provider} ${outage.kind === "auth" ? "key refused" : "out of credit"}`, summary: `Second Look did not review this PR. ${providerErrorLineOf(outage)}. Nothing was checked, so this is not a pass. Ask again with \`@clanker-in-chief review this\` once it's fixed.${link}` } }
  if (error || !verdict) return { status: "completed", conclusion: "neutral", output: { title: "Couldn't review", summary: `${error ?? "no verdict"}${link}` } }
  if (verdict.verdict === "pass") return { status: "completed", conclusion: "success", output: { title: betaEnabled ? "Approved" : "No changes requested", summary: `${verdict.summary}${link}` } }
  return { status: "completed", conclusion: notPassing, output: { title: "Changes requested", summary: `${verdict.summary}${link}` } }
}

/** the body that closes a check whose run didn't get to a review (cancelled by a newer request, or a job failed, with the `reason` when the run knows it) */
export const checkAbandonedOf = ({ result, detailsUrl, reason }: { result: string; detailsUrl: string; reason?: string }) =>
  result === "cancelled"
    ? { status: "completed", conclusion: "cancelled", output: { title: "Cancelled", summary: "A newer request or `@clanker-in-chief stop` cancelled this run." } }
    : { status: "completed", conclusion: "neutral", output: { title: "Didn't finish", summary: `Second Look's run didn't get to a review (${reason ?? result}). Comment \`@clanker-in-chief review this\` to try again; the [run](${detailsUrl}) has the details.` } }

/**
 * the body that closes the check on a run the plan skipped (reviewPlanOf.ts: the e2e sandbox, a docs-only pr): green,
 * titled "Skipped: …", so a required check passes the way it does on a pr nobody asked about. only outside the beta
 * scope: synthesize.ts reviews a beta-enabled pr in full instead, since AI Provenance's beta gate would read this green
 * check as approval
 */
export const checkSkippedOf = ({ reason }: { reason: string }) => ({ status: "completed", conclusion: "success", output: { title: `Skipped: ${reason.split(" (")[0].split(",")[0]}`, summary: `Second Look skipped this PR without a model review: ${reason}. Asking again skips again; the switches are the org variables in Second Look's README "Settings" (SECOND_LOOK_SKIP_REPOS, SECOND_LOOK_SKIP_DOCS_ONLY).` } })
