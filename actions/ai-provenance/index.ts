#!/usr/bin/env node
/**
 * AI Provenance — bot-ci's required check that harness-made prs came through
 * the touchless-bot MCP (and, on beta-enabled prs, that Second Look approved).
 *
 *   node index.ts   (in the action; reads $GITHUB_EVENT_PATH)
 *
 * env: GITHUB_TOKEN (contents/pull-requests/checks read, checks write for the
 * evaluate report), GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GITHUB_EVENT_PATH,
 * AI_PROVENANCE_MODE (`evaluate`, the default: never blocks, posts a neutral
 * "AI Provenance (evaluate)" check with the report; `enforce`: fails),
 * AI_PROVENANCE_APP_SLUG (touchless-bot), AI_PROVENANCE_APP_ID (3195153),
 * AI_PROVENANCE_WAIT_MINUTES (50: how long a beta-enabled pr waits in this job
 * for Second Look's verdict), AI_PROVENANCE_POLL_SECONDS (60).
 */
import { appendFileSync, readFileSync } from "node:fs"
import { decideProvenance, type ProvenanceMode } from "./decideProvenance.ts"
import { gatherProvenance } from "./gatherProvenance.ts"
import { githubOf } from "./githubOf.ts"
import { pullNumbersOf } from "./pullNumbersOf.ts"
import { reportOf } from "./reportOf.ts"
import { isBetaEnabled } from "./secondLookAdapter.ts"

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").replace(/::/g, ": :")

const main = async () => {
  const env = process.env
  const eventName = env.GITHUB_EVENT_NAME ?? ""
  if (eventName === "merge_group") return console.log("ai-provenance: checked on the pull request; nothing to do in the merge queue")
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8")) as Parameters<typeof pullNumbersOf>[1] & { repository?: { custom_properties?: Record<string, unknown> } }
  const numbers = pullNumbersOf(eventName, event)
  if (numbers.length === 0) return console.log(`ai-provenance: no pull request on this ${eventName} event; nothing to check`)
  const mode: ProvenanceMode = env.AI_PROVENANCE_MODE === "enforce" ? "enforce" : "evaluate"
  const repository = env.GITHUB_REPOSITORY ?? ""
  const github = githubOf(env.GITHUB_TOKEN ?? "", env.GITHUB_API_URL || undefined)
  const appSlug = env.AI_PROVENANCE_APP_SLUG || "touchless-bot"
  const appId = env.AI_PROVENANCE_APP_ID ? Number(env.AI_PROVENANCE_APP_ID) : 3195153
  const waitMs = Number(env.AI_PROVENANCE_WAIT_MINUTES || 50) * 60_000
  const pollMs = Math.max(15, Number(env.AI_PROVENANCE_POLL_SECONDS || 60)) * 1000
  let failed = false

  for (const number of numbers) {
    const started = Date.now()
    for (;;) {
      const gathered = await gatherProvenance({ github, repository, number, appSlug, appId, repoProperties: event.repository?.custom_properties })
      const betaEnabled = isBetaEnabled(gathered.beta)
      const decision = decideProvenance({ harnessSignals: gathered.harnessSignals, attestation: gathered.attestation, betaEnabled, verdict: gathered.verdict, mode })
      if (decision.state === "pending" && Date.now() - started < waitMs) {
        console.log(`ai-provenance: #${number} ${decision.title} (${Math.round((Date.now() - started) / 60_000)} of ${waitMs / 60_000} min)`)
        await sleep(pollMs)
        continue
      }
      const timedOut = decision.state === "pending"
      const final = timedOut ? { state: "failure" as const, title: `Second Look hasn't reached a verdict on ${gathered.headSha.slice(0, 7)} after ${waitMs / 60_000} min; re-run this check once it has` } : decision
      const report = reportOf({ decision: final, mode, headSha: gathered.headSha, harnessSignals: gathered.harnessSignals, attestation: gathered.attestation, beta: gathered.beta, betaEnabled, verdict: gathered.verdict })
      if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${report}\n\n`)
      console.log(report)
      if (final.state === "failure") {
        console.log(`::error title=AI Provenance::${oneLine(final.title)}`)
        failed = true
      }
      if (final.state === "neutral") {
        console.log(`::warning title=AI Provenance (evaluate)::${oneLine(final.title)}`)
        const posted = await github("POST", `/repos/${repository}/check-runs`, { name: "AI Provenance (evaluate)", head_sha: gathered.headSha, status: "completed", conclusion: "neutral", output: { title: final.title.slice(0, 250), summary: report.slice(0, 60_000) } })
        if (posted.status !== 201) console.log(`ai-provenance: couldn't post the evaluate report check (${posted.status}); it's in the job summary`)
      }
      break
    }
  }
  if (failed) process.exit(1)
}

if (import.meta.main) {
  main().catch((error: Error) => {
    console.log(`::error title=AI Provenance::couldn't evaluate this PR: ${oneLine(error.message)}`)
    process.exit(process.env.AI_PROVENANCE_MODE === "enforce" ? 1 : 0)
  })
}
