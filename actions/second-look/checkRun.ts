#!/usr/bin/env node
/**
 * second look's check on the pr, in a dispatched run: `start` opens it on the head while the
 * review runs, `abandon` closes it when the run ended without a review. synthesize.ts closes it
 * with the verdict. best effort: without the app's checks permission there's just no check,
 * and the review comment still posts.
 *
 *   node checkRun.ts start | abandon
 *
 * env: GITHUB_TOKEN (checks: write on the pr's repo), SECOND_LOOK_REPOSITORY, GITHUB_SERVER_URL,
 * GITHUB_REPOSITORY, GITHUB_RUN_ID; start: SECOND_LOOK_HEAD_SHA, optional SECOND_LOOK_REQUESTED_BY,
 * GITHUB_OUTPUT (gets check-run-id); abandon: SECOND_LOOK_CHECK_RUN_ID, SECOND_LOOK_RESULT.
 */
import { appendFileSync } from "node:fs"
import { checkAbandonedOf, checkStartOf } from "./checkRunBodyOf.ts"
import { sendCheckRun } from "./sendCheckRun.ts"

const main = async () => {
  const action = process.argv[2]
  const token = process.env.GITHUB_TOKEN ?? ""
  const repository = process.env.SECOND_LOOK_REPOSITORY ?? ""
  const detailsUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  if (action === "start") {
    const id = await sendCheckRun({ token, repository, body: checkStartOf({ headSha: process.env.SECOND_LOOK_HEAD_SHA ?? "", detailsUrl, requestedBy: process.env.SECOND_LOOK_REQUESTED_BY || undefined }) })
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `check-run-id=${id}\n`)
    return console.log(`second look: opened the check on ${repository} (${id})`)
  }
  if (action === "abandon") {
    const id = process.env.SECOND_LOOK_CHECK_RUN_ID
    if (!id) return console.log("second look: no check to close")
    await sendCheckRun({ token, repository, id, body: checkAbandonedOf({ result: process.env.SECOND_LOOK_RESULT || "failure", detailsUrl }) })
    return console.log(`second look: closed the check on ${repository} (${id})`)
  }
  throw new Error(`usage: checkRun.ts start | abandon (got "${action ?? ""}")`)
}

if (import.meta.main) main().catch((error: Error) => console.log(`::warning title=Second Look (beta)::no check on the PR: ${error.message} (the Touchless Bot App needs Checks: read and write)`))
