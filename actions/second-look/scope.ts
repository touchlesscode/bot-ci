#!/usr/bin/env node
/**
 * second look, step 1: does this pr get one? opt-in during beta: an org
 * member comments `@touchless-bot run this` and the bot re-runs this
 * workflow, which then finds the request here. writes `run` and `reason`
 * step outputs; the tester and reviewer jobs only start when run is true.
 *
 *   node scope.ts   (in the workflow)
 *
 * env: GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_OUTPUT, GITHUB_TOKEN (reads the pr's
 * comments), optional SECOND_LOOK_SAMPLE_EVERY (blank or 0 = opt-in only; 5 = also 1 in 5; 1 = every pr),
 * SECOND_LOOK_SKIP_AUTHORS and SECOND_LOOK_BOT_LOGINS (comma lists).
 */
import { appendFileSync, readFileSync } from "node:fs"
import { issueCommentsOf } from "./issueCommentsOf.ts"
import { sampleEveryOf } from "./isSampled.ts"
import { requestOf } from "./requestOf.ts"
import { defaultBotLogins, loginsOf, scopeOf } from "./scopeOf.ts"
import type { PullRequest, ScopeDecision } from "./types.ts"

const decide = async (): Promise<ScopeDecision> => {
  if (process.env.GITHUB_EVENT_NAME !== "pull_request") return { run: false, reason: "merge queue: Second Look runs on the pull request" }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request: PullRequest }
  const repository = process.env.GITHUB_REPOSITORY ?? ""
  const comments = await issueCommentsOf({ token: process.env.GITHUB_TOKEN ?? "", repository, number: event.pull_request.number }).catch((error: Error) => {
    console.log(`::warning title=Second Look (beta)::couldn't read the PR's comments, so requests can't be seen: ${error.message}`)
    return []
  })
  const botLogins = loginsOf(process.env.SECOND_LOOK_BOT_LOGINS)
  return scopeOf({
    pull: event.pull_request,
    repository,
    request: requestOf(comments),
    sampleEvery: sampleEveryOf(process.env.SECOND_LOOK_SAMPLE_EVERY),
    skipAuthors: loginsOf(process.env.SECOND_LOOK_SKIP_AUTHORS),
    botLogins: botLogins.length ? botLogins : defaultBotLogins,
  })
}

if (import.meta.main) {
  const decision = await decide()
  console.log(`second look: ${decision.run ? "running" : "skipping"}: ${decision.reason}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\nreason=${decision.reason}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Second Look (beta)\n${decision.run ? "Running" : "Skipped"}: ${decision.reason}\n`)
}
