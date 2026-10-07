import type { Verdict } from "./types.ts"

/** the check second look puts on a pr it was asked to review, named like the old required check */
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
 * the body that closes the check with the review's outcome: a pass is green and anything else
 * neutral, unless enforcing, where a block or a failed review is red
 */
export const checkEndOf = ({ verdict, error, enforcing, commentUrl }: { verdict?: Verdict; error?: string; enforcing: boolean; commentUrl?: string }) => {
  const link = commentUrl ? `\n\n[The review](${commentUrl})` : ""
  if (error || !verdict) return { status: "completed", conclusion: enforcing ? "failure" : "neutral", output: { title: "Couldn't review", summary: `${error ?? "no verdict"}${link}` } }
  if (verdict.verdict === "pass") return { status: "completed", conclusion: "success", output: { title: "Looks good", summary: `${verdict.summary}${link}` } }
  return { status: "completed", conclusion: enforcing ? "failure" : "neutral", output: { title: enforcing ? "Blocks this PR" : "Would block (advisory)", summary: `${verdict.summary}${link}` } }
}

/** the body that closes a check whose run didn't get to a review (cancelled by a newer request, or a job failed) */
export const checkAbandonedOf = ({ result, detailsUrl }: { result: string; detailsUrl: string }) =>
  result === "cancelled"
    ? { status: "completed", conclusion: "cancelled", output: { title: "Cancelled", summary: "A newer request or `@clanker-in-chief stop` cancelled this run." } }
    : { status: "completed", conclusion: "neutral", output: { title: "Didn't finish", summary: `Second Look's run didn't get to a review (${result}). Comment \`@clanker-in-chief review this\` to try again; the [run](${detailsUrl}) has the details.` } }
