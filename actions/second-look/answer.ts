#!/usr/bin/env node
/**
 * second look, answering one person: a question someone asked @clanker-in-chief on a pr, or a reply to one of its
 * inline threads, that the relay dispatched with the comment's id. in a read-only session on the base branch (the
 * pr's files at its head copied beside it), with the diff, second look's last summary, the thread or conversation
 * and the ticket, it writes a short answer and posts it there as clanker-in-chief: a reply in the thread, or a
 * conversation comment quoting the question. when no answer comes back it says so, so the relay's 👀 isn't the last
 * word. it never reviews, approves, or runs pr code.
 *
 *   node answer.ts   (in the workflow, cwd = the pr's repo checked out at its base, with the head fetched)
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief; falls back to GITHUB_TOKEN), GITHUB_TOKEN (the app: contents read,
 * issues + pull requests write on the pr's repo), SECOND_LOOK_EVENT_PATH, SECOND_LOOK_COMMENT_ID,
 * SECOND_LOOK_COMMENT_KIND (issue | review), RUNNER_TEMP, SECOND_LOOK_ANTHROPIC_API_KEY and/or SECOND_LOOK_OPENAI_API_KEY,
 * optional SECOND_LOOK_ANTHROPIC_MODEL, SECOND_LOOK_OPENAI_MODEL, SECOND_LOOK_BUDGET_USD (default 1),
 * SECOND_LOOK_TIMEOUT_MINUTES (default 8), SECOND_LOOK_CONTEXT_DIRECTORY (gatherContext.ts's output).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { answerPromptOf } from "./answerPrompt.ts"
import { answerReplyOf, noAnswerReplyOf } from "./answerReplyOf.ts"
import { childEnvironmentOf } from "./childEnvironmentOf.ts"
import { cliCommandOf, defaultModels } from "./cliCommandOf.ts"
import { commentMarker } from "./commentBodyOf.ts"
import { finalMessageOf } from "./finalMessageOf.ts"
import { cappedDiffOf, gitDiffOf } from "./gitDiffOf.ts"
import { harnessOf } from "./harnessOf.ts"
import { issueCommentsOf } from "./issueCommentsOf.ts"
import { jsonObjectOf } from "./jsonObjectOf.ts"
import { prepareAuth } from "./prepareAuth.ts"
import { questionOf, type QuestionComment, type QuestionKind } from "./questionOf.ts"
import { replyToThread } from "./replyToThread.ts"
import { appLogin, posterLogin } from "./reviewerLogins.ts"
import { reviewerFamilyOf } from "./reviewerFamilyOf.ts"
import { runCli } from "./runCli.ts"
import { answerSchema } from "./schemas.ts"
import { targetOf } from "./targetOf.ts"
import type { Family } from "./types.ts"
import { writeHeadFiles } from "./writeHeadFiles.ts"

const maxPromptDiffChars = 60_000
const maxHeadFiles = 60

const keyOf = (family: Family) => process.env[`SECOND_LOOK_${family.toUpperCase()}_API_KEY`] ?? ""
const modelOf = (family: Family) => process.env[`SECOND_LOOK_${family.toUpperCase()}_MODEL`] || defaultModels[family]

/** every review comment on a pr, oldest first */
const reviewCommentsOf = async ({ token, repository, number }: { token: string; repository: string; number: number }): Promise<QuestionComment[]> => {
  const pageOf = async (page: number): Promise<QuestionComment[]> => {
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${number}/comments?per_page=100&page=${page}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } })
    if (!response.ok) throw new Error(`listing review comments answered ${response.status}`)
    const comments = (await response.json()) as QuestionComment[]
    return comments.length === 100 ? [...comments, ...(await pageOf(page + 1))] : comments
  }
  return pageOf(1)
}

/** the model's answer, or why there isn't one */
const answerOf = async ({ family, prompt, inputs }: { family: Family; prompt: string; inputs: string }): Promise<{ answer?: string; error?: string }> => {
  const key = keyOf(family)
  if (!key) return { error: "no model key is set up" }
  const schemaPath = join(inputs, "answer.schema.json")
  const outputPath = join(inputs, `${family}-answer.json`)
  writeFileSync(schemaPath, JSON.stringify(answerSchema))
  const { keyFile, extraEnvironment } = prepareAuth({ family, key, directory: join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-auth") })
  const { command, args } = cliCommandOf({ family, role: "reviewer", model: modelOf(family), filesDirectory: inputs, schemaText: JSON.stringify(answerSchema), schemaPath, outputPath, budgetUsd: Number(process.env.SECOND_LOOK_BUDGET_USD) || 1, keyFile, home: homedir() })
  const timeoutMinutes = Number(process.env.SECOND_LOOK_TIMEOUT_MINUTES) || 8
  const result = await runCli({ command, args, cwd: process.cwd(), environment: childEnvironmentOf(process.env, extraEnvironment), input: prompt, timeoutMs: timeoutMinutes * 60_000 })
  const { text } = finalMessageOf({ family, stdout: result.stdout, outputPath })
  if (!text.trim()) return { error: result.timedOut ? `ran out of time after ${timeoutMinutes} minutes` : "the model gave no answer" }
  try {
    const { answer } = jsonObjectOf(text)
    return typeof answer === "string" && answer.trim() ? { answer } : { error: "the model's answer was empty" }
  } catch {
    return { error: "the model's answer didn't parse" }
  }
}

const main = async () => {
  const { repository, pull } = targetOf()
  const kind: QuestionKind = process.env.SECOND_LOOK_COMMENT_KIND === "review" ? "review" : "issue"
  const commentId = Number(process.env.SECOND_LOOK_COMMENT_ID)
  if (!Number.isInteger(commentId) || commentId < 1) throw new Error(`"${process.env.SECOND_LOOK_COMMENT_ID}" isn't a comment id`)
  const postToken = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const appToken = process.env.GITHUB_TOKEN || postToken
  const author = process.env.SECOND_LOOK_POST_TOKEN ? posterLogin : appLogin
  const conversation = await issueCommentsOf({ token: appToken, repository, number: pull.number })
  const question = questionOf({ kind, commentId, comments: kind === "review" ? await reviewCommentsOf({ token: appToken, repository, number: pull.number }) : conversation })
  if (!question) throw new Error(`comment ${commentId} isn't on ${repository}#${pull.number}`)

  const inputs = join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-inputs")
  mkdirSync(inputs, { recursive: true })
  const { diff, changedPaths } = gitDiffOf({ base: pull.base.sha, head: pull.head.sha })
  const diffPath = join(inputs, "pr.diff")
  writeFileSync(diffPath, diff)
  const headDirectory = join(inputs, "head")
  writeHeadFiles({ head: pull.head.sha, paths: [...(question.path ? [question.path] : []), ...changedPaths].slice(0, maxHeadFiles), directory: headDirectory })
  const capped = cappedDiffOf(diff, maxPromptDiffChars)
  const summary = conversation.filter((comment) => comment.user?.login === author && (comment.body ?? "").includes(commentMarker)).at(-1)?.body ?? ""
  const contextPath = join(process.env.SECOND_LOOK_CONTEXT_DIRECTORY || join(inputs, "context"), "context.md")
  const family = reviewerFamilyOf(harnessOf(pull.body), { anthropic: Boolean(keyOf("anthropic")), openai: Boolean(keyOf("openai")) })
  const prompt = answerPromptOf({ repository, pull, reviewer: family, question, diff: capped.text, truncated: capped.truncated, diffPath, headDirectory, summary, context: existsSync(contextPath) ? readFileSync(contextPath, "utf8") : "" })

  const { answer, error } = await answerOf({ family, prompt, inputs }).catch((failure: Error) => ({ answer: undefined, error: failure.message }))
  if (error) console.log(`::warning title=Second Look (beta)::no answer for comment ${commentId}: ${error}`)
  const body = answer ? answerReplyOf({ answer, question, reviewer: family }) : noAnswerReplyOf({ question, reason: error ?? "no answer" })
  if (question.kind === "review") await replyToThread({ token: postToken, repository, number: pull.number, commentId: question.replyTo, body })
  else {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues/${pull.number}/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${postToken}`, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify({ body }),
    })
    if (!response.ok) throw new Error(`posting the answer answered ${response.status}`)
  }
  console.log(`second look: answered @${question.author} on ${repository}#${pull.number} (${question.kind} comment ${commentId})${answer ? "" : `, without an answer: ${error}`}`)
}

if (import.meta.main) main().catch((error: Error) => {
  console.error(`second look: ${error.message}`)
  process.exit(1)
})
