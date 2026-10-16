#!/usr/bin/env node
/**
 * second look's wrap-up when a run ended without a review (and wasn't cancelled): the relay already
 * told the pr a review is coming, so this says it isn't, with a link to the run, as a comment review
 * that tags the author with the force-approval hint (a plain pr comment when a review can't be posted). best effort.
 *
 *   node notifyUnfinished.ts
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief's PAT) or GITHUB_TOKEN (the app, issues + pull requests write),
 * SECOND_LOOK_REPOSITORY (validated by prepare), SECOND_LOOK_NUMBER, SECOND_LOOK_RESULT, SECOND_LOOK_STAGE,
 * GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID.
 */
import { approveHintOf } from "./approveHintOf.ts"
import { unfinishedReplyOf } from "./unfinishedReplyOf.ts"

const main = async () => {
  const token = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const repository = process.env.SECOND_LOOK_REPOSITORY ?? ""
  const number = process.env.SECOND_LOOK_NUMBER ?? ""
  if (!token || !repository || !/^\d+$/.test(number)) return console.log("second look: no token or pr to tell, skipping the reply")
  const api = (path: string, body?: unknown) =>
    fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const detailsUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const pull = await api(`pulls/${number}`)
  const author = pull.ok ? ((await pull.json()) as { user?: { login?: string } }).user?.login : undefined
  const body = `${unfinishedReplyOf({ result: process.env.SECOND_LOOK_RESULT || "failure", stage: process.env.SECOND_LOOK_STAGE || "review", detailsUrl })}\n\n${approveHintOf(author)}`
  const review = await api(`pulls/${number}/reviews`, { event: "COMMENT", body })
  if (review.ok) return console.log(`second look: told ${repository}#${number} the run didn't finish (comment review)`)
  const comment = await api(`issues/${number}/comments`, { body })
  if (!comment.ok) throw new Error(`replying answered ${review.status}, then ${comment.status}`)
  console.log(`second look: told ${repository}#${number} the run didn't finish`)
}

if (import.meta.main) main().catch((error: Error) => console.log(`::warning title=Second Look (beta)::couldn't tell the PR the run didn't finish: ${error.message}`))
