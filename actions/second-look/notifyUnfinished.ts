#!/usr/bin/env node
/**
 * second look's wrap-up when a run ended without a review (and wasn't cancelled): the relay already
 * told the pr a review is coming, so this says it isn't, with a link to the run, as a comment review
 * (a plain pr comment when a review can't be posted). a comment review clears a pending review request,
 * which ends watch mode, so a poster that was requested is requested again after. best effort.
 *
 *   node notifyUnfinished.ts
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief's PAT) or GITHUB_TOKEN (the app, issues + pull requests write),
 * SECOND_LOOK_REPOSITORY (validated by prepare), SECOND_LOOK_NUMBER, SECOND_LOOK_RESULT, SECOND_LOOK_STAGE,
 * GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID.
 */
import { isRequestedReviewer } from "./isRequestedReviewer.ts"
import { requestReviewer } from "./requestReviewer.ts"
import { appLogin, posterLogin } from "./reviewerLogins.ts"
import { unfinishedReplyOf } from "./unfinishedReplyOf.ts"

/**
 * posts `body` on the pr as `author` (with `postToken`): a comment review, or a plain comment when that's refused.
 * when `author` was a requested reviewer, it's requested again with `appToken` after the review, as synthesize.ts
 * does. returns how it replied; throws when neither reply went through
 */
export const notifyUnfinished = async ({ postToken, appToken, author, repository, number, body, warn = (line: string) => console.log(`::warning title=Second Look (beta)::${line}`), fetchImpl = fetch }: {
  postToken: string
  appToken: string
  author: string
  repository: string
  number: number
  body: string
  warn?: (line: string) => void
  fetchImpl?: typeof fetch
}) => {
  const post = (path: string, payload: unknown) =>
    fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${postToken}`, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  const wasRequested = await isRequestedReviewer({ token: appToken, repository, number, login: author, fetchImpl })
  const review = await post(`pulls/${number}/reviews`, { event: "COMMENT", body })
  if (review.ok) {
    if (wasRequested) await requestReviewer({ token: appToken, repository, number, login: author, fetchImpl }).catch((failure: Error) => warn(failure.message))
    return "review" as const
  }
  const comment = await post(`issues/${number}/comments`, { body })
  if (!comment.ok) throw new Error(`replying answered ${review.status}, then ${comment.status}`)
  return "comment" as const
}

const main = async () => {
  const postToken = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const appToken = process.env.GITHUB_TOKEN || postToken
  const author = process.env.SECOND_LOOK_POST_TOKEN ? posterLogin : appLogin
  const repository = process.env.SECOND_LOOK_REPOSITORY ?? ""
  const number = process.env.SECOND_LOOK_NUMBER ?? ""
  if (!postToken || !repository || !/^\d+$/.test(number)) return console.log("second look: no token or pr to tell, skipping the reply")
  const detailsUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const body = unfinishedReplyOf({ result: process.env.SECOND_LOOK_RESULT || "failure", stage: process.env.SECOND_LOOK_STAGE || "review", detailsUrl })
  const replied = await notifyUnfinished({ postToken, appToken, author, repository, number: Number(number), body })
  console.log(`second look: told ${repository}#${number} the run didn't finish${replied === "review" ? " (comment review)" : ""}`)
}

if (import.meta.main) main().catch((error: Error) => console.log(`::warning title=Second Look (beta)::couldn't tell the PR the run didn't finish: ${error.message}`))
