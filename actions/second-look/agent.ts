#!/usr/bin/env node
/**
 * second look, step 2 (one job per family): a tester agent in a snapshot of the
 * pr's files follows the pr's test plan (against its previews or canary packages when it has them,
 * see awaitPreviews.ts), then its report is written for the main reviewer. never fails the job: no key, a
 * crash or a timeout become a report that says so.
 *
 *   node agent.ts   (in the workflow, cwd = the pr's files, unpacked from prepare's bundle)
 *
 * env: SECOND_LOOK_FAMILY (anthropic | openai), SECOND_LOOK_API_KEY, optional SECOND_LOOK_MODEL,
 * SECOND_LOOK_BUDGET_USD (claude's spend cap, default 5), SECOND_LOOK_TIMEOUT_MINUTES (default 25),
 * SECOND_LOOK_PREVIEWS_FILE (awaitPreviews.ts's list), SECOND_LOOK_CODEX_SANDBOX (danger-full-access when codex's
 * linux sandbox can't start on the runner), SECOND_LOOK_EVENT_PATH (the pr, see targetOf.ts), SECOND_LOOK_DIFF_DIRECTORY
 * (pr.diff and pr.stat from prepare; without it, the diff comes from git in cwd), RUNNER_TEMP, and for a dash preview
 * SECOND_LOOK_DASH_SESSION (prepare's sealed session, dashSignIn.ts) + SECOND_LOOK_SIGNIN_TRANSPORT_KEY: the harness opens
 * it into files the agent loads (dashAccessOf.ts), masks its cookies and redacts them from the report.
 * writes $RUNNER_TEMP/second-look-report/second-look-<family>.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { agentPromptOf } from "./agentPrompt.ts"
import type { PreviewsFile } from "./awaitPreviews.ts"
import { childEnvironmentOf } from "./childEnvironmentOf.ts"
import { dashAccessOf, type DashAccess } from "./dashAccessOf.ts"
import { cliCommandOf, defaultModels } from "./cliCommandOf.ts"
import { finalMessageOf } from "./finalMessageOf.ts"
import { cappedDiffOf, gitDiffOf } from "./gitDiffOf.ts"
import { targetOf } from "./targetOf.ts"
import { prepareAuth } from "./prepareAuth.ts"
import { redactedReportOf } from "./redactedReportOf.ts"
import { crashedReportOf, reportOf, skippedReportOf } from "./reportOf.ts"
import { runCli } from "./runCli.ts"
import { reportSchema } from "./schemas.ts"
import type { AgentReport, Family } from "./types.ts"

const maxPromptDiffChars = 60_000

/** the report's dash line: always when signed in or a sign-in failed, else only when a dash preview is listed */
const accessLineOf = (access: DashAccess, previews: PreviewsFile | undefined) =>
  access.signedIn || previews?.signIn?.status === "failed" || previews?.previews.some((preview) => /dash/i.test(preview.label)) ? access.line : undefined

const test = async (family: Family, model: string, access: DashAccess, previews: PreviewsFile | undefined, inputs: string): Promise<AgentReport> => {
  const key = process.env.SECOND_LOOK_API_KEY ?? ""
  if (!key) return skippedReportOf(family, model, `no ${family} key: set the SECOND_LOOK_${family.toUpperCase()}_API_KEY org secret`)
  const temporary = process.env.RUNNER_TEMP ?? "/tmp"
  const { repository, pull } = targetOf()
  const diffDirectory = process.env.SECOND_LOOK_DIFF_DIRECTORY
  const { diff, stat } = diffDirectory
    ? { diff: readFileSync(join(diffDirectory, "pr.diff"), "utf8"), stat: readFileSync(join(diffDirectory, "pr.stat"), "utf8") }
    : gitDiffOf({ base: pull.base.sha, head: pull.head.sha })
  const diffPath = join(inputs, "pr.diff")
  const schemaPath = join(inputs, "report.schema.json")
  const outputPath = join(inputs, `${family}-last-message.json`)
  writeFileSync(diffPath, diff)
  writeFileSync(schemaPath, JSON.stringify(reportSchema))
  const capped = cappedDiffOf(diff, maxPromptDiffChars)
  const prompt = agentPromptOf({
    family,
    repository,
    pull,
    stat,
    diff: capped.text,
    truncated: capped.truncated,
    diffPath,
    previews,
    access,
  })
  const { keyFile, extraEnvironment } = prepareAuth({ family, key, directory: join(temporary, "second-look-auth") })
  const { command, args } = cliCommandOf({
    family,
    role: "tester",
    model,
    filesDirectory: inputs,
    schemaText: JSON.stringify(reportSchema),
    schemaPath,
    outputPath,
    budgetUsd: Number(process.env.SECOND_LOOK_BUDGET_USD) || 5,
    keyFile,
    home: homedir(),
    codexSandbox: process.env.SECOND_LOOK_CODEX_SANDBOX,
  })
  const timeoutMinutes = Number(process.env.SECOND_LOOK_TIMEOUT_MINUTES) || 25
  const result = await runCli({ command, args, cwd: process.cwd(), environment: childEnvironmentOf(process.env, extraEnvironment), input: prompt, timeoutMs: timeoutMinutes * 60_000 })
  const { text, costUsd } = finalMessageOf({ family, stdout: result.stdout, outputPath })
  if (result.timedOut && !text.trim()) return crashedReportOf(family, model, `the ${family} tester ran out of time (${timeoutMinutes} minutes)`)
  if (!text.trim()) return crashedReportOf(family, model, `the ${family} tester exited ${result.code} without an answer`)
  return reportOf({ family, model, text, costUsd })
}

if (import.meta.main) {
  const family = process.env.SECOND_LOOK_FAMILY === "openai" ? "openai" : "anthropic"
  const model = process.env.SECOND_LOOK_MODEL || defaultModels[family]
  const inputs = join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-inputs")
  mkdirSync(inputs, { recursive: true })
  const previewsFile = process.env.SECOND_LOOK_PREVIEWS_FILE || join(inputs, "previews.json")
  const previews = existsSync(previewsFile) ? (JSON.parse(readFileSync(previewsFile, "utf8")) as PreviewsFile) : undefined
  const access = await dashAccessOf({ sealed: process.env.SECOND_LOOK_DASH_SESSION, transportKey: process.env.SECOND_LOOK_SIGNIN_TRANSPORT_KEY, note: previews?.signIn?.note, directory: join(inputs, "dash-signin") })
    .catch((): DashAccess => ({ signedIn: false, line: "Not signed in to Dash: the harness couldn't set up the session." }))
  const secrets = access.signedIn ? access.secrets : []
  for (const value of secrets) console.log(`::add-mask::${value}`)
  console.log(access.line)
  const tested = await test(family, model, access, previews, inputs).catch((error: Error) => crashedReportOf(family, model, `the ${family} tester crashed: ${error.message}`))
  const line = accessLineOf(access, previews)
  const report = redactedReportOf(line ? { ...tested, access: line } : tested, secrets)
  const directory = join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-report")
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `second-look-${family}.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== "ran") console.log(`::warning title=Second Look (beta)::${report.summary}`)
}
