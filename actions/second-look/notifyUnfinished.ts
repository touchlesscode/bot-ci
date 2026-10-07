#!/usr/bin/env node
/**
 * second look's wrap-up when a run ended without a review (and wasn't cancelled): the relay already
 * told the pr a review is coming, so this says it isn't, with a link to the run. best effort.
 *
 *   node notifyUnfinished.ts
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief's PAT) or GITHUB_TOKEN (the app, issues write),
 * SECOND_LOOK_REPOSITORY (validated by prepare), SECOND_LOOK_NUMBER, SECOND_LOOK_RESULT, SECOND_LOOK_STAGE,
 * GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID.
 */
import { unfinishedReplyOf } from "./unfinishedReplyOf.ts"

const main = async () => {
  const token = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const repository = process.env.SECOND_LOOK_REPOSITORY ?? ""
  const number = process.env.SECOND_LOOK_NUMBER ?? ""
  if (!token || !repository || !/^\d+$/.test(number)) return console.log("second look: no token or pr to tell, skipping the reply")
  const detailsUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  const body = unfinishedReplyOf({ result: process.env.SECOND_LOOK_RESULT || "failure", stage: process.env.SECOND_LOOK_STAGE || "review", detailsUrl })
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${number}/comments`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new Error(`replying answered ${response.status}`)
  console.log(`second look: told ${repository}#${number} the run didn't finish`)
}

if (import.meta.main) main().catch((error: Error) => console.log(`::warning title=Second Look (beta)::couldn't tell the PR the run didn't finish: ${error.message}`))
