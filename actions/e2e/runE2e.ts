#!/usr/bin/env node
/**
 * the E2E job, after Previews: for each preview it deployed whose app declares `test:e2e`, waits for the
 * preview to answer, then runs the app's Playwright tests with PREVIEW_URL set to it (the template's
 * playwright.config.ts uses that as baseURL). runs the PR's code with no secrets; the reports are uploaded
 * as the `playwright-report` artifact by the action. every app runs even after one fails.
 *
 *   node runE2e.ts   (in the ci action, e2e mode; cwd = the checked-out repo, already installed)
 *
 * env: BOT_CI_E2E_PREVIEWS (the previews job's JSON), BOT_CI_PACKAGE_MANAGER, BOT_CI_E2E_WAIT_SECONDS (120),
 * GITHUB_STEP_SUMMARY.
 */
import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { awaitUrl } from "./awaitUrl.ts"
import { e2ePreviewsOf } from "./e2ePreviewsOf.ts"
import { e2eRunsOf } from "./e2eRunsOf.ts"

const execPrefixes: Record<string, string[]> = { pnpm: ["pnpm", "exec"], yarn: ["yarn"], bun: ["bunx"], npm: ["npx", "--no-install"] }

const main = async () => {
  const packageManager = process.env.BOT_CI_PACKAGE_MANAGER || "npm"
  const previews = e2ePreviewsOf(process.env.BOT_CI_E2E_PREVIEWS)
  const { runs, skipped } = e2eRunsOf({ previews, packageManager, readText: (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined) })
  for (const skip of skipped) console.log(`::notice title=E2E::${skip.label} skipped: ${skip.reason}`)
  if (!runs.length) return console.log("e2e: no previewed app declares test:e2e; nothing to run")
  const [command, ...prefix] = execPrefixes[packageManager] ?? execPrefixes.npm!
  console.log("::group::playwright install chromium")
  const install = spawnSync(command!, [...prefix, "playwright", "install", "--with-deps", "chromium"], { stdio: "inherit" })
  console.log("::endgroup::")
  if (install.status !== 0) throw new Error("couldn't install Playwright's chromium: is @playwright/test a devDependency at the repo root?")
  const waitMs = (Number(process.env.BOT_CI_E2E_WAIT_SECONDS) || 120) * 1_000
  const results: { label: string; url: string; passed: boolean }[] = []
  for (const run of runs) {
    const { ready, answered } = await awaitUrl({ url: run.url, timeoutMs: waitMs })
    if (!ready) console.log(`::warning title=E2E::${run.label}'s preview still answers ${answered} after ${waitMs / 1_000}s; testing it anyway`)
    console.log(`::group::e2e ${run.label} → ${run.url}`)
    const result = spawnSync(run.command[0]!, run.command.slice(1), { cwd: run.cwd, stdio: "inherit", env: { ...process.env, PREVIEW_URL: run.url, CI: "true" } })
    console.log("::endgroup::")
    if (result.status !== 0) console.log(`::error title=E2E::${run.label} failed against ${run.url}; the playwright-report artifact has the trace`)
    results.push({ label: run.label, url: run.url, passed: result.status === 0 })
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### E2E\n${results.map((result) => `- ${result.passed ? "🟢" : "🔴"} ${result.label}: ${result.url}`).join("\n")}\n${skipped.map((skip) => `- ⚪ ${skip.label}: ${skip.reason}`).join("\n")}\n`)
  if (results.some((result) => !result.passed)) process.exitCode = 1
}

if (import.meta.main) main().catch((error: Error) => {
  console.log(`::error title=E2E::${error.message}`)
  process.exitCode = 1
})
