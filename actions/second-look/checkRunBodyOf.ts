import type { Verdict } from "./types.ts"

/** the check second look puts on a pr it reviews, named like the old required check */
export const checkName = "Second Look (beta)"

/** the body that opens the check on the pr's head while the review runs */
export const checkStartOf = ({ headSha, detailsUrl, requestedBy }: { headSha: string; detailsUrl: string; requestedBy?: string }) => ({
  name: checkName,
  head_sha: headSha,
  status: "in_progress",
  details_url: detailsUrl,
  output: {
    title: "Reviewing",
    summary: `${requestedBy ? `Requested by @${requestedBy}. ` : ""}An OpenAI and an Anthropic tester try the PR's test plan by hand (on its previews, canary packages or a sandbox build), then a main reviewer checks the change against its ticket and the repo's docs. The review lands as a comment on the PR in about 20-30 minutes.`,
  },
})

/**
 * the body that closes the check with the review's outcome. outside the beta scope the check is informational: a pass
 * is green ("no changes requested", never an approval) and anything else neutral, never red. on a beta-enabled pr it
 * enforces: a pass is an approval, and a block (the review requests changes either way) or a failed review is red
 */
export const checkEndOf = ({ verdict, error, betaEnabled, commentUrl }: { verdict?: Verdict; error?: string; betaEnabled: boolean; commentUrl?: string }) => {
  const link = commentUrl ? `\n\n[The review](${commentUrl})` : ""
  const notPassing = betaEnabled ? "failure" : "neutral"
  if (error || !verdict) return { status: "completed", conclusion: notPassing, output: { title: "Couldn't review", summary: `${error ?? "no verdict"}${link}` } }
  if (verdict.verdict === "pass") return { status: "completed", conclusion: "success", output: { title: betaEnabled ? "Approved" : "No changes requested", summary: `${verdict.summary}${link}` } }
  return { status: "completed", conclusion: notPassing, output: { title: "Changes requested", summary: `${verdict.summary}${link}` } }
}

/** the body that closes a check whose run didn't get to a review (cancelled by a newer request, or a job failed) */
export const checkAbandonedOf = ({ result, detailsUrl }: { result: string; detailsUrl: string }) =>
  result === "cancelled"
    ? { status: "completed", conclusion: "cancelled", output: { title: "Cancelled", summary: "A newer request or `@clanker-in-chief stop` cancelled this run." } }
    : { status: "completed", conclusion: "neutral", output: { title: "Didn't finish", summary: `Second Look's run didn't get to a review (${result}). Comment \`@clanker-in-chief review this\` to try again; the [run](${detailsUrl}) has the details.` } }
