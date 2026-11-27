#!/usr/bin/env node
/**
 * second look, step 3: the main reviewer. in a read-only session on the base
 * branch, with the ticket and designs gatherContext.ts read, it learns what the
 * pr is for and the code around it, reads the repo's docs for the intended
 * architecture, reviews the diff against all that and the rules, folds in both
 * testers' reports, and follows up on its own open threads from earlier runs: a fixed one
 * gets a reply and is resolved, a changed one gets a reply, and nothing is posted twice. it also reads the pr's
 * conversation (conversationDigestOf.ts): what became of each earlier finding, other reviewers' comments and what people
 * decided, so it doesn't raise again what was fixed, answered or already said.
 * then it submits one review as clanker-in-chief: request changes on a block, a comment when it couldn't review, and on
 * a pass a comment, or an approval only when the relay dispatched the run for a beta-enabled pr (SECOND_LOOK_BETA_ENABLED,
 * reviewEventOf.ts), with the new findings that sit on the diff as inline comments. a pass also dismisses its own earlier
 * change requests on the pr (dismissOwnChangeRequests.ts), since a comment review never lifts one. then one sticky pr comment, and it
 * closes the pr's check with the outcome: outside the beta scope informational (green on a pass, neutral otherwise,
 * never red), on a beta-enabled pr green on a pass and red otherwise. it never runs pr code. exits 1 only when it
 * crashes before closing the check, so the workflow's wrap-up closes it instead.
 *
 *   node synthesize.ts   (in the workflow, cwd = the pr's repo checked out at its base, with the head fetched)
 *
 * env: SECOND_LOOK_POST_TOKEN (clanker-in-chief's classic PAT, repo; falls back to GITHUB_TOKEN),
 * GITHUB_TOKEN (the touchless bot app: contents read, issues + pull requests write on the pr's repo),
 * SECOND_LOOK_CHECKS_TOKEN (the app with checks write; blank when the app lacks it, then there's no check),
 * SECOND_LOOK_RESOLVE_TOKEN (the app with contents + pull requests write, used only to resolve review threads
 * where the poster can't; blank: only the poster's own access resolves them),
 * SECOND_LOOK_EVENT_PATH (the pr, see targetOf.ts), RUNNER_TEMP, SECOND_LOOK_ANTHROPIC_API_KEY and/or
 * SECOND_LOOK_OPENAI_API_KEY, optional SECOND_LOOK_ANTHROPIC_MODEL, SECOND_LOOK_OPENAI_MODEL, SECOND_LOOK_BETA_ENABLED,
 * SECOND_LOOK_REPORTS_DIRECTORY (the testers' downloaded reports), SECOND_LOOK_DEFAULT_RULES,
 * SECOND_LOOK_REQUESTED_BY, SECOND_LOOK_BUDGET_USD (default 3), SECOND_LOOK_TIMEOUT_MINUTES (default 15),
 * SECOND_LOOK_CONTEXT_DIRECTORY (gatherContext.ts's output), SECOND_LOOK_CHECK_RUN_ID (the check to close),
 * SECOND_LOOK_OUTAGE_RED (on unless `off`).
 *
 * spend (README "Settings"): it follows the run's plan from the event file (fetchReviewPlan.ts). a skipped run (the e2e
 * sandbox, a docs-only pr) posts a short comment review and closes the check green "Skipped: …" with no model. a
 * re-review gives the reviewer only the changes since the last reviewed head (with the whole diff on disk), and a small,
 * low-risk diff gets the smaller anthropic model. the reviewer's cost and model are logged (`second look cost:` line,
 * the job summary and the comment's footer). a provider refusing on credit, quota or its key (providerErrorOf.ts), the
 * reviewer's or a tester's, is an outage: the comment says plainly what didn't happen, the check closes red when the
 * reviewer refused, and the job exits 1 so the run is red too (Wrap Up then sees the comment and doesn't reply again).
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { architectureDocsOf } from "./architectureDocsOf.ts"
import { betaEnabledOf } from "./betaEnabledOf.ts"
import { childEnvironmentOf } from "./childEnvironmentOf.ts"
import { cliCommandOf, defaultModels } from "./cliCommandOf.ts"
import { cliNameOf } from "./cliNameOf.ts"
import { commentBodyOf, commentMarker, outageLeadOf } from "./commentBodyOf.ts"
import { commentableLinesOf } from "./commentableLinesOf.ts"
import { directorySnapshot } from "./directorySnapshot.ts"
import { dismissOwnChangeRequests } from "./dismissOwnChangeRequests.ts"
import { finalMessageOf } from "./finalMessageOf.ts"
import { cappedDiffOf, gitDiffOf } from "./gitDiffOf.ts"
import { answeredThreadsOf } from "./answeredThreadsOf.ts"
import { conversationDigestOf } from "./conversationDigestOf.ts"
import { conversationOf } from "./conversationOf.ts"
import { earlierSectionOf } from "./earlierSectionOf.ts"
import { fixedUnresolvedOf } from "./fixedUnresolvedOf.ts"
import { followUpThreads, stillOpenOf } from "./followUpThreads.ts"
import { ledgerOf, nextLedgerOf } from "./ledgerOf.ts"
import { lineFingerprintOf } from "./lineFingerprint.ts"
import { openThreadsOf } from "./openThreadsOf.ts"
import { settledSpotsOf } from "./settledSpotsOf.ts"
import { stickyCommentOf } from "./stickyCommentOf.ts"
import { harnessOf } from "./harnessOf.ts"
import { inlineCommentsOf } from "./inlineCommentsOf.ts"
import { headlineOf } from "./headlineOf.ts"
import { postReview } from "./postReview.ts"
import { postStickyComment } from "./postStickyComment.ts"
import { appLogin, posterLogin } from "./reviewerLogins.ts"
import { retriedOnceOf } from "./retriedOnceOf.ts"
import { reviewBodyOf } from "./reviewBodyOf.ts"
import { reviewEventOf } from "./reviewEventOf.ts"
import { routeFindingsOf } from "./routeFindingsOf.ts"
import { threadKeysLinkedOf } from "./threadKeysLinkedOf.ts"
import type { EarlierThread, ProviderError, PullConversation } from "./types.ts"
import { writeHeadFiles } from "./writeHeadFiles.ts"
import { prepareAuth } from "./prepareAuth.ts"
import { storedReportOf } from "./reportOf.ts"
import { resolveLeftOpen } from "./resolveLeftOpen.ts"
import { reviewerFamilyOf } from "./reviewerFamilyOf.ts"
import { repoRulePaths, rulesOf } from "./rulesOf.ts"
import { withTestingRules } from "./withTestingRules.ts"
import { runCli } from "./runCli.ts"
import { verdictSchema } from "./schemas.ts"
import { checkAbandonedOf, checkEndOf, checkSkippedOf } from "./checkRunBodyOf.ts"
import { effectivePlanOf, planLineOf, planOf, smallModelOf } from "./fetchReviewPlan.ts"
import { cliErrorTextOf, providerErrorLineOf, providerErrorOf } from "./providerErrorOf.ts"
import { lastReviewOf } from "./reviewPlanOf.ts"
import { spendSettings, switchOf } from "./spendSettings.ts"
import { costLineOf, costTextOf, usageOf, type AgentUsage } from "./usageOf.ts"
import { sendCheckRun } from "./sendCheckRun.ts"
import { synthesisPromptOf } from "./synthesisPrompt.ts"
import { labelEventsOf } from "./labelEventsOf.ts"
import { tierGatedVerdictOf } from "./tierGatedVerdictOf.ts"
import { tierOverrideOf } from "./tierOverrideOf.ts"
import { tierRestrictedAuthors } from "./riskTiers.ts"
import { targetOf } from "./targetOf.ts"
import type { Family, Verdict } from "./types.ts"
import { verdictOf } from "./verdictOf.ts"
import { standingLinesOf, withoutRepeatsOf } from "./withoutRepeatsOf.ts"

const maxPromptDiffChars = 120_000
const families: Family[] = ["openai", "anthropic"]

const keyOf = (family: Family) => process.env[`SECOND_LOOK_${family.toUpperCase()}_API_KEY`] ?? ""
// a beta-enabled pr is never skipped (effectivePlanOf): its skip would be a green check AI Provenance reads as approval
const plan = effectivePlanOf(planOf(), betaEnabledOf(process.env.SECOND_LOOK_BETA_ENABLED))
/** the plan's smaller anthropic model, until main knows whether the re-review's diff held (smallModelOf) */
let smallModel = plan.anthropicModel
/** the configured model, or the smaller anthropic one for a small, low-risk diff */
const modelOf = (family: Family) => (family === "anthropic" && smallModel) || process.env[`SECOND_LOOK_${family.toUpperCase()}_MODEL`] || defaultModels[family]
const outageRed = switchOf(process.env.SECOND_LOOK_OUTAGE_RED, spendSettings.outageRed)

type Reviewed = { verdict?: Verdict; error?: string; outage?: ProviderError; usage?: AgentUsage }

/** the main reviewer's verdict, or the reason there isn't one (with the provider's refusal when that's the reason), and what it cost */
const review = async ({ reviewer, prompt }: { reviewer: Family; prompt: string }): Promise<Reviewed> => {
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
  const usage = usageOf({ family: reviewer, stdout: result.stdout, stderrTail: result.stderrTail })
  console.log(costLineOf({ role: "reviewer", family: reviewer, model: modelOf(reviewer), usage }))
  // only the cli's own error output is searched, never the reviewer's answer, which can quote the pr's own error strings
  const failed = (error: string): Reviewed => {
    const outage = providerErrorOf(reviewer, cliErrorTextOf({ family: reviewer, stdout: result.stdout, stderrTail: result.stderrTail, code: result.code }))
    return { error: outage ? providerErrorLineOf(outage) : error, ...(outage ? { outage } : {}), usage }
  }
  if (!text.trim()) return failed(result.timedOut ? `ran out of time (${timeoutMinutes} minutes)` : `exited ${result.code} without an answer`)
  try {
    return { verdict: verdictOf(text), usage }
  } catch (error) {
    return failed((error as Error).message)
  }
}

/**
 * a run the plan skipped: one comment review saying why (it also clears a pending review request, as a review would),
 * and the check closed green "Skipped: …". no model runs and the summary comment is left as it was
 */
const skipRun = async ({ repository, pull, reason }: { repository: string; pull: { number: number; head: { sha: string } }; reason: string }) => {
  const postToken = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const checkToken = process.env.SECOND_LOOK_CHECKS_TOKEN || ""
  const body = `**Second Look: skipped** · no model review\n\nSkipped: ${reason}. Nothing was reviewed; the switches are in Second Look's README "Settings".`
  console.log(body)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`)
  await postReview({ token: postToken, repository, number: pull.number, commitId: pull.head.sha, event: "COMMENT", comments: [], body })
    .catch((failure: Error) => console.log(`::warning title=Second Look::couldn't post the skip note: ${failure.message}`))
  const checkRunId = process.env.SECOND_LOOK_CHECK_RUN_ID
  if (checkRunId && checkToken) await sendCheckRun({ token: checkToken, repository, id: checkRunId, body: checkSkippedOf({ reason }) })
    .catch((failure: Error) => console.log(`::warning title=Second Look::couldn't close the check: ${failure.message}`))
}

const main = async () => {
  const { repository, pull } = targetOf()
  console.log(planLineOf(plan))
  if (plan.skip) return skipRun({ repository, pull, reason: plan.skip })
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
  // a re-review shows the reviewer what changed since the head it last reviewed. the plan checked that head is an
  // ancestor through github; git checks again here, and anything off falls back to the whole pr
  const since = plan.review === "incremental" && plan.since ? plan.since : undefined
  const incremental = since ? (() => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", since, pull.head.sha], { stdio: "ignore" })
      return gitDiffOf({ base: since, head: pull.head.sha }).diff
    } catch {
      console.log(`::notice title=Second Look::${since.slice(0, 7)} isn't an ancestor of the head here, so this reviews the whole PR with the configured model`)
      return undefined
    }
  })() : undefined
  smallModel = smallModelOf(plan, incremental !== undefined)
  const sinceDiffPath = join(inputs, "since.diff")
  if (incremental !== undefined) writeFileSync(sinceDiffPath, incremental)
  const capped = cappedDiffOf(incremental ?? diff, maxPromptDiffChars)
  const harness = harnessOf(pull.body)
  const reviewer = reviewerFamilyOf(harness, { anthropic: Boolean(keyOf("anthropic")), openai: Boolean(keyOf("openai")) })
  const postToken = process.env.SECOND_LOOK_POST_TOKEN || process.env.GITHUB_TOKEN || ""
  const appToken = process.env.GITHUB_TOKEN || postToken
  const checkToken = process.env.SECOND_LOOK_CHECKS_TOKEN || ""
  // resolving a thread takes write access to the repo: the poster has it in some repos only, and an app token needs
  // contents write for it, which only the resolve token carries
  const resolveTokens = [postToken, process.env.SECOND_LOOK_RESOLVE_TOKEN || "", appToken]
  const author = process.env.SECOND_LOOK_POST_TOKEN ? posterLogin : appLogin
  // what was already said on the pr, read once: the earlier threads to follow up, and what became of every finding,
  // so one that was fixed, answered or made by someone else isn't raised again
  // without it the review would repeat every earlier point, so an unreadable conversation fails the run (the check
  // ends "Didn't finish") after one retry
  const conversation: PullConversation = await retriedOnceOf(() => conversationOf({ token: postToken, repository, number: pull.number }), (failure) =>
    console.log(`::warning title=Second Look::couldn't read the PR's conversation, trying once more: ${failure.message}`))
    .catch(async (failure: Error) => {
      const reason = `couldn't read the PR's conversation, so it won't review without knowing what was already said: ${failure.message}`
      const checkRunId = process.env.SECOND_LOOK_CHECK_RUN_ID
      const detailsUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      if (checkRunId && checkToken) await sendCheckRun({ token: checkToken, repository, id: checkRunId, body: checkAbandonedOf({ result: "failure", reason, detailsUrl }) }).catch(() => undefined)
      throw new Error(reason)
    })
  const open: EarlierThread[] = openThreadsOf({ conversation, author })
  const threads = [...open, ...answeredThreadsOf({ conversation, author, after: open.length })]
  // the sticky comment keeps its first date, so it's found by paging every comment, not among the latest 100
  const sticky = await stickyCommentOf({ token: postToken, repository, number: pull.number, marker: commentMarker, author }).catch((failure: Error) => {
    console.log(`::warning title=Second Look::couldn't read the last summary comment, so its summary-only findings aren't in the review: ${failure.message}`)
    return undefined
  })
  const ledger = ledgerOf(sticky?.body ?? undefined)
  const ownResolved = conversation.threads.filter((thread) => thread.resolved && thread.comments[0]?.author === author).map((thread) => thread.path)
  const headFiles = writeHeadFiles({ head: pull.head.sha, paths: [...threads.map((thread) => thread.path), ...ownResolved], directory: join(inputs, "head") })
  const fingerprintAt = (path: string, line: number) => {
    const file = headFiles.get(path)
    return file && existsSync(file) ? lineFingerprintOf(readFileSync(file, "utf8"), line) : undefined
  }
  const settled = settledSpotsOf({ conversation, author, fingerprintAt })
  const prompt = synthesisPromptOf({
    repository,
    pull,
    reviewer,
    harness,
    diff: capped.text,
    truncated: capped.truncated,
    diffPath: incremental !== undefined ? sinceDiffPath : diffPath,
    ...(incremental !== undefined && since ? { rereview: { since, sinceTier: plan.sinceTier, fullDiffPath: diffPath } } : {}),
    docs: architectureDocsOf({ repo: directorySnapshot(process.cwd()), changedPaths }),
    rules: withTestingRules(rulesOf([...repoRulePaths, process.env.SECOND_LOOK_DEFAULT_RULES]), process.env.SECOND_LOOK_TESTING_RULES),
    reports,
    context: existsSync(contextPath) ? readFileSync(contextPath, "utf8") : "",
    earlier: earlierSectionOf({ threads, headFiles }),
    conversation: conversationDigestOf({ conversation, ownLogins: [posterLogin, appLogin], earlier: threads, ledger }),
  })
  console.log(`second look reviewer: ${reviewer} ${modelOf(reviewer)}${reviewer === "anthropic" && smallModel ? ` (smaller model: ${plan.modelReason})` : ""}`)
  const { verdict: reviewed, error, outage, usage: reviewerUsage } = await review({ reviewer, prompt }).catch((failure: Error): Reviewed => ({ error: failure.message }))
  const betaEnabled = betaEnabledOf(process.env.SECOND_LOOK_BETA_ENABLED)
  const warn = (line: string) => console.log(`::warning title=Second Look::${line}`)
  // a tier-restricted author's tier 1-2 pr is a block unless a tech lead overrode it; unreadable events mean no override
  const restricted = tierRestrictedAuthors.some((login) => login.toLowerCase() === (pull.user?.login ?? "").toLowerCase())
  const overriddenBy = reviewed && reviewed.tier > 0 && restricted ? tierOverrideOf(await labelEventsOf({ token: appToken, repository, number: pull.number }).catch((failure: Error) => {
    warn(`couldn't read the PR's labels, so no risk-tier override counts: ${failure.message}`)
    return []
  })) : undefined
  const reviewedVerdict = tierGatedVerdictOf({ verdict: reviewed, author: pull.user?.login, overriddenBy })
  if (overriddenBy) console.log(`risk tier ${reviewed?.tier} overridden by @${overriddenBy}`)
  const { inline } = inlineCommentsOf({ findings: reviewedVerdict?.findings ?? [], commentable: commentableLinesOf(diff), reviewer })
  const { fresh, onThread, dropped } = routeFindingsOf({ inline, threads, settled })
  for (const { spot, finding } of dropped) console.log(`dropped a repeat on ${spot.path}:${spot.line}, already answered in ${spot.url}: ${finding.note.slice(0, 120)}`)
  // a repeat on a spot that already had its one reply isn't posted again, but a blocking one still stands and keeps the block
  const { verdict, standing, downgraded } = withoutRepeatsOf({ verdict: reviewedVerdict, dropped, threads })
  if (downgraded) console.log("::notice title=Second Look::no changes requested: what blocked was only nits already answered in their threads")
  const followUps = verdict ? await followUpThreads({ threads, followUps: verdict.earlier, onThread, headSha: pull.head.sha, reviewer, token: postToken, resolveTokens, repository, number: pull.number, warn, fingerprintOf: (thread) => (thread.line === null ? undefined : fingerprintAt(thread.path, thread.line)) }) : []
  // threads an earlier run called fixed and github wouldn't let it resolve: resolved now, with no second reply
  const leftOpen = await resolveLeftOpen({ threads: fixedUnresolvedOf({ conversation, author }), tokens: resolveTokens, warn })
  if (leftOpen.length) console.log(`resolved ${leftOpen.length} thread(s) an earlier run called fixed: ${leftOpen.map((thread) => thread.comments[0]?.url ?? thread.id).join(", ")}`)
  const event = reviewEventOf({ verdict, betaEnabled })
  const headline = !verdict && outage ? "**Second Look: did not review**" : headlineOf({ verdict, open: stillOpenOf(followUps).length + standing.length, betaEnabled })
  const reviewBody = reviewBodyOf({
    headline,
    summary: verdict ? [threadKeysLinkedOf(threads)(verdict.summary), ...(standing.length ? ["", ...standingLinesOf(standing)] : [])].join("\n") : outage ? outageLeadOf(outage) : error ? `Couldn't review: ${error}` : undefined,
    reviewer,
    readRepo: verdict?.readRepo,
  })
  if (verdict?.readRepo === false) warn(`the ${cliNameOf(reviewer)} reviewer couldn't read the repo, so it reviewed from the diff alone`)
  const posted = await postReview({ token: postToken, repository, number: pull.number, commitId: pull.head.sha, event, comments: fresh.map(({ comment }) => comment), body: reviewBody })
    .catch((failure: Error) => {
      warn(`couldn't post the review, the summary has every finding: ${failure.message}`)
      return null
    })
  if (posted !== null && event !== "COMMENT" && posted?.event !== event) warn(`GitHub wouldn't let @${author} ${event === "REQUEST_CHANGES" ? "request changes" : "approve"} on this PR (its own?), so the review only comments`)
  const reviewUrl = posted?.url || undefined
  if (reviewUrl) console.log(`second look review (${posted?.event}): ${reviewUrl}`)
  // a pass that only comments never replaces this reviewer's earlier change request, which would still block the merge
  if (posted !== null && verdict?.verdict === "pass") {
    await dismissOwnChangeRequests({ tokens: [appToken, postToken], repository, number: pull.number, login: author, headSha: pull.head.sha })
      .then((ids) => ids.length && console.log(`lifted the earlier change request: ${ids.join(", ")}`))
      .catch((failure: Error) => warn(failure.message))
  }
  const onDiff = new Set(reviewUrl ? fresh.map(({ finding }) => finding) : [])
  const inThreads = new Set(onThread.map(({ finding }) => finding))
  const summaryOnly = verdict ? verdict.findings.filter((finding) => !onDiff.has(finding) && !inThreads.has(finding)) : []
  // built against the comment it replaces, so the ledger always carries on from what's actually there
  // the reviewed head rides along for the next run's diff; a run without a verdict keeps the last one
  const bodyFor = (existing: string | undefined) => commentBodyOf({ verdict, error, reports, reviewer, reviewerModel: modelOf(reviewer), harness, headSha: pull.head.sha, scopeReason: betaEnabled ? "in Second Look's scope" : process.env.SECOND_LOOK_REQUESTED_BY ? `requested by @${process.env.SECOND_LOOK_REQUESTED_BY}` : "requested", onDiff, reviewUrl, followUps, betaEnabled, overriddenBy, standing, ledger: nextLedgerOf({ earlier: ledgerOf(existing), findings: summaryOnly, sha: pull.head.sha }), outage, reviewerUsage, plan: incremental !== undefined ? plan : { ...plan, review: "full" }, reviewed: verdict ? { sha: pull.head.sha, tier: verdict.tier } : lastReviewOf(existing), runId: process.env.GITHUB_RUN_ID })
  const body = bodyFor(sticky?.body ?? undefined)
  console.log(body)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n\n**Reviewer:** ${cliNameOf(reviewer)} ${modelOf(reviewer)}, cost ${costTextOf(reviewerUsage)}\n`)
  const commentUrl = await postStickyComment({ token: postToken, repository, number: pull.number, body: bodyFor, marker: commentMarker, author })
    .then((url) => {
      console.log(`second look comment: ${url}`)
      return url
    })
    .catch((failure: Error) => {
      console.log(`::warning title=Second Look::couldn't post the comment: ${failure.message}`)
      return undefined
    })
  const checkRunId = process.env.SECOND_LOOK_CHECK_RUN_ID
  if (checkRunId && checkToken) await sendCheckRun({ token: checkToken, repository, id: checkRunId, body: checkEndOf({ verdict, error, betaEnabled, commentUrl, outage, outageRed }) })
    .catch((failure: Error) => console.log(`::warning title=Second Look::couldn't close the check: ${failure.message}`))
  // a provider outage fails the run, so it shows red in the second-look repo's actions and to whoever watches it
  const outages = [...(outage ? [outage] : []), ...reports.flatMap((report) => (report.providerError ? [report.providerError] : []))]
  for (const each of outages) console.log(`::error title=Second Look provider outage::${providerErrorLineOf(each)} (${repository}#${pull.number})`)
  if (outages.length && outageRed) process.exitCode = 1
  if (error) return console.log(`::warning title=Second Look::couldn't review: ${error}`)
  if (verdict?.verdict === "block") console.log("::warning title=Second Look::requested changes on this PR; see the comment.")
}

if (import.meta.main) main().catch((error: Error) => {
  console.error(`second look failed: ${error.message}`)
  process.exit(1)
})
