#!/usr/bin/env node
/**
 * second look, step 3: the main reviewer. in a read-only session on the base
 * branch, with the ticket and designs gatherContext.ts read, it learns what the
 * pr is for and the code around it, reads the repo's docs for the intended
 * architecture, reviews the diff against all that and the rules, folds in both
 * testers' reports, leaves the findings that sit on the diff as inline review comments,
 * posts one sticky pr comment as clanker-in-chief and closes the pr's check with the
 * outcome. it never runs pr code. advisory by default:
 * a block turns the pr's check red only with SECOND_LOOK_MODE=enforce. exits 1 only
 * when it crashes before closing the check, so the workflow's wrap-up closes it instead.
 *
 *   node synthesize.ts   (in the workflow, cwd = the pr's repo checked out at its base, with the head fetched)
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief's classic PAT, repo; falls back to GITHUB_TOKEN),
 * GITHUB_TOKEN (the touchless bot app: contents read, issues + pull requests write on the pr's repo),
 * SECOND_LOOK_CHECKS_TOKEN (the app with checks write; blank when the app lacks it, then there's no check),
 * SECOND_LOOK_EVENT_PATH (the pr, see targetOf.ts), RUNNER_TEMP, SECOND_LOOK_ANTHROPIC_API_KEY and/or
 * SECOND_LOOK_OPENAI_API_KEY, optional SECOND_LOOK_ANTHROPIC_MODEL, SECOND_LOOK_OPENAI_MODEL, SECOND_LOOK_MODE,
 * SECOND_LOOK_REPORTS_DIRECTORY (the testers' downloaded reports), SECOND_LOOK_DEFAULT_RULES,
 * SECOND_LOOK_REQUESTED_BY, SECOND_LOOK_BUDGET_USD (default 3), SECOND_LOOK_TIMEOUT_MINUTES (default 15),
 * SECOND_LOOK_CONTEXT_DIRECTORY (gatherContext.ts's output), SECOND_LOOK_CHECK_RUN_ID (the check to close).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { architectureDocsOf } from "./architectureDocsOf.ts"
import { childEnvironmentOf } from "./childEnvironmentOf.ts"
import { cliCommandOf, defaultModels } from "./cliCommandOf.ts"
import { commentBodyOf, commentMarker } from "./commentBodyOf.ts"
import { commentableLinesOf } from "./commentableLinesOf.ts"
import { directorySnapshot } from "./directorySnapshot.ts"
import { finalMessageOf } from "./finalMessageOf.ts"
import { cappedDiffOf, gitDiffOf } from "./gitDiffOf.ts"
import { harnessOf } from "./harnessOf.ts"
import { inlineCommentsOf } from "./inlineCommentsOf.ts"
import { isEnforcing } from "./isEnforcing.ts"
import { postInlineReview } from "./postInlineReview.ts"
import { postStickyComment } from "./postStickyComment.ts"
import { prepareAuth } from "./prepareAuth.ts"
import { storedReportOf } from "./reportOf.ts"
import { reviewerFamilyOf } from "./reviewerFamilyOf.ts"
import { repoRulePaths, rulesOf } from "./rulesOf.ts"
import { runCli } from "./runCli.ts"
import { verdictSchema } from "./schemas.ts"
import { checkEndOf } from "./checkRunBodyOf.ts"
import { sendCheckRun } from "./sendCheckRun.ts"
import { synthesisPromptOf } from "./synthesisPrompt.ts"
import { targetOf } from "./targetOf.ts"
import type { Family, Verdict } from "./types.ts"
import { verdictOf } from "./verdictOf.ts"

const maxPromptDiffChars = 120_000
const families: Family[] = ["openai", "anthropic"]
const posterLogin = "clanker-in-chief"
const appLogin = "touchless-bot[bot]"

const keyOf = (family: Family) => process.env[`SECOND_LOOK_${family.toUpperCase()}_API_KEY`] ?? ""
const modelOf = (family: Family) => process.env[`SECOND_LOOK_${family.toUpperCase()}_MODEL`] || defaultModels[family]

/** the main reviewer's verdict, or the reason there isn't one */
const review = async ({ reviewer, prompt }: { reviewer: Family; prompt: string }): Promise<{ verdict?: Verdict; error?: string }> => {
  const key = keyOf(reviewer)
  if (!key) return { error: "no model key: set the SECOND_LOOK_ANTHROPIC_API_KEY and/or SECOND_LOOK_OPENAI_API_KEY org secret" }
  const temporary = process.env.RUNNER_TEMP ?? "/tmp"
  const inputs = join(temporary, "second-look-inputs")
  const schemaPath = join(inputs, "verdict.schema.json")
  const outputPath = join(inputs, `${reviewer}-verdict.json`)
  writeFileSync(schemaPath, JSON.stringify(verdictSchema))
  const { keyFile, extraEnvironment } = prepareAuth({ family: reviewer, key, directory: join(temporary, "second-look-auth") })
  const { command, args } = cliCommandOf({
    family: reviewer,
    role: "reviewer",
    model: modelOf(reviewer),
    filesDirectory: inputs,
    schemaText: JSON.stringify(verdictSchema),
    schemaPath,
    outputPath,
    budgetUsd: Number(process.env.SECOND_LOOK_BUDGET_USD) || 3,
    keyFile,
    home: homedir(),
  })
  const timeoutMinutes = Number(process.env.SECOND_LOOK_TIMEOUT_MINUTES) || 15
  const result = await runCli({ command, args, cwd: process.cwd(), environment: childEnvironmentOf(process.env, extraEnvironment), input: prompt, timeoutMs: timeoutMinutes * 60_000 })
  const { text } = finalMessageOf({ family: reviewer, stdout: result.stdout, outputPath })
  if (!text.trim()) return { error: result.timedOut ? `ran out of time (${timeoutMinutes} minutes)` : `exited ${result.code} without an answer` }
  try {
    return { verdict: verdictOf(text) }
  } catch (error) {
    return { error: (error as Error).message }
  }
}

const main = async () => {
  const { repository, pull } = targetOf()
  const reportsDirectory = process.env.SECOND_LOOK_REPORTS_DIRECTORY ?? join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-reports")
  const reports = families.map((family) => {
    const path = join(reportsDirectory, `second-look-${family}.json`)
    return storedReportOf(family, existsSync(path) ? readFileSync(path, "utf8") : undefined)
  })
  const inputs = join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-inputs")
  mkdirSync(inputs, { recursive: true })
  const contextPath = join(process.env.SECOND_LOOK_CONTEXT_DIRECTORY || join(inputs, "context"), "context.md")
  const { diff, changedPaths } = gitDiffOf({ base: pull.base.sha, head: pull.head.sha })
  const diffPath = join(inputs, "pr.diff")
  writeFileSync(diffPath, diff)
  const capped = cappedDiffOf(diff, maxPromptDiffChars)
  const harness = harnessOf(pull.body)
  const reviewer = reviewerFamilyOf(harness, { anthropic: Boolean(keyOf("anthropic")), openai: Boolean(keyOf("openai")) })
  const prompt = synthesisPromptOf({
    repository,
    pull,
    reviewer,
    harness,
    diff: capped.text,
    truncated: capped.truncated,
    diffPath,
    docs: architectureDocsOf({ repo: directorySnapshot(process.cwd()), changedPaths }),
    rules: rulesOf([...repoRulePaths, process.env.SECOND_LOOK_DEFAULT_RULES]),
    reports,
    context: existsSync(contextPath) ? readFileSync(contextPath, "utf8") : "",
  })
  const { verdict, error } = await review({ reviewer, prompt }).catch((failure: Error) => ({ verdict: undefined, error: failure.message }))
  const enforcing = isEnforcing(process.env.SECOND_LOOK_MODE)
  const postToken = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const appToken = process.env.GITHUB_TOKEN || postToken
  const checkToken = process.env.SECOND_LOOK_CHECKS_TOKEN || ""
  const author = process.env.SECOND_LOOK_POST_TOKEN ? posterLogin : appLogin
  const { inline } = inlineCommentsOf({ findings: verdict?.findings ?? [], commentable: commentableLinesOf(diff) })
  const reviewBody = `**Second Look (beta)** · ${inline.length} finding${inline.length === 1 ? "" : "s"} on the diff at \`${pull.head.sha.slice(0, 7)}\`. The verdict, how it matches the ticket and what the testers verified are in the Second Look comment on this PR.`
  const inlineReview = await postInlineReview({ token: postToken, requestToken: appToken, repository, number: pull.number, commitId: pull.head.sha, comments: inline.map(({ comment }) => comment), body: reviewBody, author })
    .then((posted) => {
      if (posted.url) console.log(`second look inline review: ${posted.url}`)
      if (posted.warning) console.log(`::warning title=Second Look (beta)::${posted.warning}`)
      return { ...posted, onDiff: new Set(inline.map(({ finding }) => finding)) }
    })
    .catch((failure: Error) => {
      console.log(`::warning title=Second Look (beta)::couldn't post the inline comments, the summary has every finding: ${failure.message}`)
      return { url: undefined, onDiff: new Set<never>() }
    })
  const body = commentBodyOf({ verdict, error, reports, reviewer, reviewerModel: modelOf(reviewer), harness, enforcing, headSha: pull.head.sha, scopeReason: process.env.SECOND_LOOK_REQUESTED_BY ? `requested by @${process.env.SECOND_LOOK_REQUESTED_BY}` : "requested", onDiff: inlineReview.onDiff, reviewUrl: inlineReview.url })
  console.log(body)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`)
  const commentUrl = await postStickyComment({ token: postToken, repository, number: pull.number, body, marker: commentMarker, author })
    .then((url) => {
      console.log(`second look comment: ${url}`)
      return url
    })
    .catch((failure: Error) => {
      console.log(`::warning title=Second Look (beta)::couldn't post the comment: ${failure.message}`)
      return undefined
    })
  const checkRunId = process.env.SECOND_LOOK_CHECK_RUN_ID
  if (checkRunId && checkToken) await sendCheckRun({ token: checkToken, repository, id: checkRunId, body: checkEndOf({ verdict, error, enforcing, commentUrl }) })
    .catch((failure: Error) => console.log(`::warning title=Second Look (beta)::couldn't close the check: ${failure.message}`))
  if (error) return console.log(`::warning title=Second Look (beta)::couldn't review: ${error}`)
  if (verdict?.verdict === "block") console.log(`::warning title=Second Look (beta)::${enforcing ? "blocks" : "would block"} this PR; see the comment.${enforcing ? "" : " With the org variable SECOND_LOOK_MODE=enforce its check on the PR turns red."}`)
}

if (import.meta.main) main().catch((error: Error) => {
  console.error(`second look failed: ${error.message}`)
  process.exit(1)
})
