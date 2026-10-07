#!/usr/bin/env node
/**
 * second look, step 3: the main reviewer. in a read-only session on the base
 * branch, with the ticket and designs gatherContext.ts read, it learns what the
 * pr is for and the code around it, reads the repo's docs for the intended
 * architecture, reviews the diff against all that and the rules, folds in both
 * testers' reports, and queues one sticky pr comment for the bot's relay to post
 * as the touchless bot (queuePost.ts). it never runs pr code. advisory by default: exits 1 only
 * with SECOND_LOOK_MODE=enforce on a block or an error.
 *
 *   node synthesize.ts   (in the workflow, cwd = the base checkout with the pr head fetched)
 *
 * env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, RUNNER_TEMP, SECOND_LOOK_ANTHROPIC_API_KEY and/or
 * SECOND_LOOK_OPENAI_API_KEY, optional SECOND_LOOK_ANTHROPIC_MODEL, SECOND_LOOK_OPENAI_MODEL, SECOND_LOOK_MODE,
 * SECOND_LOOK_REPORTS_DIRECTORY (the testers' downloaded reports), SECOND_LOOK_DEFAULT_RULES,
 * SECOND_LOOK_SCOPE_REASON, SECOND_LOOK_BUDGET_USD (default 3), SECOND_LOOK_TIMEOUT_MINUTES (default 15),
 * SECOND_LOOK_CONTEXT_DIRECTORY (gatherContext.ts's output),
 * BOT_CI_POSTS_DIRECTORY (where queued posts go), BOT_CI_POST_AS (github-actions posts with GITHUB_TOKEN instead).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { architectureDocsOf } from "./architectureDocsOf.ts"
import { childEnvironmentOf } from "./childEnvironmentOf.ts"
import { cliCommandOf, defaultModels } from "./cliCommandOf.ts"
import { commentBodyOf, commentMarker } from "./commentBodyOf.ts"
import { directorySnapshot } from "./directorySnapshot.ts"
import { finalMessageOf } from "./finalMessageOf.ts"
import { cappedDiffOf, gitDiffOf } from "./gitDiffOf.ts"
import { harnessOf } from "./harnessOf.ts"
import { isEnforcing } from "./isEnforcing.ts"
import { postStickyComment } from "./postStickyComment.ts"
import { prepareAuth } from "./prepareAuth.ts"
import { posterOf, queuePost } from "./queuePost.ts"
import { storedReportOf } from "./reportOf.ts"
import { reviewerFamilyOf } from "./reviewerFamilyOf.ts"
import { repoRulePaths, rulesOf } from "./rulesOf.ts"
import { runCli } from "./runCli.ts"
import { verdictSchema } from "./schemas.ts"
import { synthesisPromptOf } from "./synthesisPrompt.ts"
import type { Family, PullRequest, Verdict } from "./types.ts"
import { verdictOf } from "./verdictOf.ts"

const maxPromptDiffChars = 120_000
const families: Family[] = ["openai", "anthropic"]

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
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request: PullRequest }
  const pull = event.pull_request
  const repository = process.env.GITHUB_REPOSITORY ?? ""
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
  const body = commentBodyOf({ verdict, error, reports, reviewer, reviewerModel: modelOf(reviewer), harness, enforcing, headSha: pull.head.sha, scopeReason: process.env.SECOND_LOOK_SCOPE_REASON || "sampled" })
  console.log(body)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`)
  if (posterOf(process.env.BOT_CI_POST_AS) === "touchless-bot") {
    queuePost({ directory: process.env.BOT_CI_POSTS_DIRECTORY ?? join(process.env.RUNNER_TEMP ?? "/tmp", "bot-ci-posts"), repository, number: pull.number, headSha: pull.head.sha, post: { kind: "sticky-comment", marker: commentMarker, body } })
    console.log("second look comment: queued; the Touchless Bot posts it within about 2 minutes of the run finishing")
  } else {
    await postStickyComment({ token: process.env.GITHUB_TOKEN ?? "", repository, number: pull.number, body, marker: commentMarker, author: "github-actions[bot]" })
      .then((url) => console.log(`second look comment: ${url}`))
      .catch((failure: Error) => console.log(`::warning title=Second Look (beta)::couldn't post the comment: ${failure.message}`))
  }
  if (error) {
    if (enforcing) {
      console.error(`second look couldn't review: ${error}`)
      process.exit(1)
    }
    console.log(`::warning title=Second Look (beta)::couldn't review, not failing the check: ${error}`)
    return
  }
  if (verdict?.verdict !== "block") return
  if (enforcing) process.exit(1)
  console.log("::warning title=Second Look (beta)::would block this PR; see the comment. Set the org variable SECOND_LOOK_MODE=enforce to fail the check.")
}

if (import.meta.main) main().catch((error: Error) => {
  if (isEnforcing(process.env.SECOND_LOOK_MODE)) {
    console.error(`second look failed: ${error.message}`)
    process.exit(1)
  }
  console.log(`::warning title=Second Look (beta)::couldn't review, not failing the check: ${error.message}`)
})
