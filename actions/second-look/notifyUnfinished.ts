#!/usr/bin/env node
/**
 * second look's wrap-up when a run ended without a review (and wasn't cancelled): the relay already
 * told the pr a review is coming, so this says it isn't, with a link to the run, as a comment review
 * (a plain pr comment when a review can't be posted). a comment review clears a pending review request, and it stays
 * cleared: second look never asks for itself, so whoever wants the review asks again. best effort.
 *
 *   node notifyUnfinished.ts
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief's PAT) or GITHUB_TOKEN (the app, issues + pull requests write),
 * SECOND_LOOK_REPOSITORY (validated by prepare), SECOND_LOOK_NUMBER, SECOND_LOOK_RESULT, SECOND_LOOK_STAGE,
 * GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID.
 */
import { unfinishedReplyOf } from "./unfinishedReplyOf.ts"

/**
 * posts `body` on the pr with `postToken`: a comment review, or a plain comment when that's refused. returns how it
 * replied; throws when neither reply went through
 */
export const notifyUnfinished = async ({ postToken, repository, number, body, fetchImpl = fetch }: {
  postToken: string
  repository: string
  number: number
  body: string
  fetchImpl?: typeof fetch
}) => {
  const post = (path: string, payload: unknown) =>
    fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${postToken}`, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  const review = await post(`pulls/${number}/reviews`, { event: "COMMENT", body })
  if (review.ok) return "review" as const
  const comment = await post(`issues/${number}/comments`, { body })
  if (!comment.ok) throw new Error(`replying answered ${review.status}, then ${comment.status}`)
  return "comment" as const
}

const main = async () => {
  const postToken = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const repository = process.env.SECOND_LOOK_REPOSITORY ?? ""
  const number = process.env.SECOND_LOOK_NUMBER ?? ""
  if (!postToken || !repository || !/^\d+$/.test(number)) return console.log("second look: no token or pr to tell, skipping the reply")
  const detailsUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const body = unfinishedReplyOf({ result: process.env.SECOND_LOOK_RESULT || "failure", stage: process.env.SECOND_LOOK_STAGE || "review", detailsUrl })
  const replied = await notifyUnfinished({ postToken, repository, number: Number(number), body })
  console.log(`second look: told ${repository}#${number} the run didn't finish${replied === "review" ? " (comment review)" : ""}`)
}

if (import.meta.main) main().catch((error: Error) => console.log(`::warning title=Second Look (beta)::couldn't tell the PR the run didn't finish: ${error.message}`))
