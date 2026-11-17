import { cliNameOf } from "./cliNameOf.ts"
import { firstSentenceOf } from "./firstSentenceOf.ts"
import { stillOpenOf, type ThreadOutcome } from "./followUpThreads.ts"
import { headlineOf } from "./headlineOf.ts"
import { labelOf } from "./labelOf.ts"
import { ledgerCommentOf } from "./ledgerOf.ts"
import { threadKeysLinkedOf } from "./threadKeysLinkedOf.ts"
import type { AgentReport, Family, Finding, Harness, LedgerEntry, Verdict } from "./types.ts"
import { standingLinesOf, type StandingRepeat } from "./withoutRepeatsOf.ts"

export const commentMarker = "<!-- touchless-second-look -->"

const familyName: Record<Family, string> = { anthropic: "Anthropic", openai: "OpenAI" }
const resultLabel = { pass: "pass", fail: "**fail**", couldnt: "couldn't" }
const maxSteps = 25
const maxChars = 60_000

/** a markdown table cell: one line, no pipes, capped */
const cellOf = (text: string, max = 300) => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").slice(0, max) || " "

const locationOf = (file: string | null, line: number | null) => (file ? `\`${file}${line ? `:${line}` : ""}\` ` : "")

const fileNameOf = (path: string) => path.split("/").at(-1) ?? path

/** a new finding's bullet: one on the diff links its spot there and its first sentence is enough; one off the diff keeps its whole note and source */
const findingLineOf = (onDiff: ReadonlySet<Finding>, linked: (text: string) => string, reviewUrl?: string) => (finding: Finding) => {
  if (reviewUrl && finding.file && onDiff.has(finding)) return `- ${labelOf(finding.severity)} [\`${fileNameOf(finding.file)}:${finding.line}\`](${reviewUrl}) ${linked(firstSentenceOf(finding.note))}`
  const source = finding.source === "general judgement" ? "" : ` _(${finding.source})_`
  return `- ${labelOf(finding.severity)} ${locationOf(finding.file, finding.line)}${linked(finding.note)}${source}`
}

/** an earlier thread as a link named by its file and line, flagged when this run replied in it */
const threadLinkOf = ({ thread, status }: ThreadOutcome) =>
  `[\`${fileNameOf(thread.path)}${!thread.outdated && thread.line ? `:${thread.line}` : ""}\`](${thread.url})${status === "update" ? " (replied)" : ""}`

/** what's fixed since the last look, what's still open, and the answered threads this run replied in: a line each, of links to the threads */
const followUpLinesOf = (followUps: ThreadOutcome[]) => {
  const fixed = followUps.filter(({ thread, status }) => status === "fixed" && !thread.resolvedBy)
  const open = stillOpenOf(followUps)
  const answered = followUps.filter(({ thread, status }) => thread.resolvedBy && status === "update")
  return [
    ...(fixed.length ? ["", `**Fixed since the last look:** ${fixed.map(threadLinkOf).join(", ")}`] : []),
    ...(open.length ? ["", `**Still open:** ${open.map(threadLinkOf).join(", ")}`] : []),
    ...(answered.length ? ["", `**Answered on resolved threads:** ${answered.map(threadLinkOf).join(", ")}`] : []),
  ]
}

/** a section collapsed under `summary`, or nothing when it'd be empty */
const detailsOf = (summary: string, body: string[]) => (body.length ? [`<details><summary>${summary}</summary>`, "", ...body, "", "</details>"] : [])

/** how the pr matches its ticket, what the testers verified and where they disagree, under a heading each */
const ticketAndTestingOf = (verdict: Verdict, linked: (text: string) => string) =>
  ([["Against the ticket", verdict.intent], ["Verified", verdict.tested], ["Where the testers disagree", verdict.disagreements]] as [string, string[]][])
    .filter(([, items]) => items.length)
    .flatMap(([title, items], index) => [...(index ? [""] : []), `**${title}**`, ...items.map((item) => `- ${linked(item)}`)])

/** "3 pass, 1 fail, 2 couldn't", or why the tester has nothing */
const tallyOf = (report: AgentReport) => {
  if (report.status !== "ran") return report.status === "skipped" ? "didn't run" : "crashed"
  const count = (result: string) => report.replicated.filter((step) => step.result === result).length
  return [`${count("pass")} pass`, `${count("fail")} fail`, `${count("couldnt")} couldn't`].join(", ")
}

/** one tester's collapsed section: summary, its dash sign-in line, the steps table, its concerns */
const reportSectionOf = (report: AgentReport) => {
  const steps = report.replicated.slice(0, maxSteps)
  return detailsOf(`${familyName[report.family]} tester · ${report.model} · ${tallyOf(report)}`, [
    `${report.summary}${report.status === "ran" ? ` _(confidence: ${report.confidence})_` : ""}`,
    ...(report.access ? ["", `_${report.access}_`] : []),
    ...(steps.length ? ["", "| Step | Command | Result | Note |", "| --- | --- | --- | --- |", ...steps.map((step) => `| ${cellOf(step.step, 120)} | \`${cellOf(step.command, 200)}\` | ${resultLabel[step.result]} | ${cellOf(step.note)} |`)] : []),
    ...(report.replicated.length > maxSteps ? [`_…and ${report.replicated.length - maxSteps} more steps_`] : []),
    ...(report.concerns.length ? ["", "Concerns:", ...report.concerns.map((concern) => `- ${locationOf(concern.file, concern.line)}${concern.note}`)] : []),
  ])
}

/**
 * the sticky comment, kept short: the call, the reviewer's summary, each new finding in a line (linking the ones
 * on the diff, in the review at `reviewUrl`) and links to the earlier threads (`followUps`) that are fixed or still
 * open. the ticket fit and testing, each tester's steps and the intended architecture sit collapsed below.
 * `error` replaces the summary when the main reviewer didn't answer. `betaEnabled` is whether a pass is an approval.
 * the risk tier follows the findings and threads, with the tech lead who overrode its gate (`overriddenBy`) when one did.
 * `ledger` (ledgerOf.ts) rides along hidden, so the next run knows the findings that only this comment carried
 */
export const commentBodyOf = ({ verdict, error, reports, reviewer, reviewerModel, harness, headSha, scopeReason, onDiff = new Set(), reviewUrl, followUps = [], betaEnabled = false, overriddenBy, ledger = [], standing = [] }: {
  verdict?: Verdict
  error?: string
  reports: AgentReport[]
  reviewer: Family
  reviewerModel: string
  harness: Harness | undefined
  headSha: string
  scopeReason: string
  onDiff?: ReadonlySet<Finding>
  reviewUrl?: string
  followUps?: ThreadOutcome[]
  betaEnabled?: boolean
  overriddenBy?: string
  ledger?: LedgerEntry[]
  /** re-raised warnings on spots already answered (withoutRepeatsOf.ts): listed once with their thread, never posted again */
  standing?: StandingRepeat[]
}) => {
  const cost = reports.reduce((total, report) => total + (report.costUsd ?? 0), 0)
  const linked = threadKeysLinkedOf(followUps.map(({ thread }) => thread))
  const lines = [
    commentMarker,
    headlineOf({ verdict, open: stillOpenOf(followUps).length + standing.length, betaEnabled }),
    "",
    verdict ? linked(verdict.summary) : `The main reviewer didn't answer: ${error ?? "unknown error"}. The testers' reports are below.`,
    ...(verdict?.findings.length ? ["", ...verdict.findings.map(findingLineOf(onDiff, linked, reviewUrl))] : []),
    ...(standing.length ? ["", ...standingLinesOf(standing)] : []),
    ...followUpLinesOf(followUps),
    ...(verdict ? ["", `**Risk tier ${verdict.tier}:** ${linked(verdict.tierReason)}${overriddenBy ? ` · overridden by @${overriddenBy}` : ""}`] : []),
    "",
    ...(verdict ? detailsOf("Ticket and testing", ticketAndTestingOf(verdict, linked)) : []),
    ...reports.flatMap(reportSectionOf),
    ...(verdict ? detailsOf("Intended architecture, as read from the docs", verdict.intendedArchitecture.map((line) => `- ${line}`)) : []),
    "",
    `<sub>Reviewed via ${cliNameOf(reviewer)} (${reviewerModel})${harness ? ` · PR by ${cliNameOf(harness)}` : ""} · head ${headSha.slice(0, 7)} · ${scopeReason}${cost ? ` · Anthropic tester cost $${cost.toFixed(2)}` : ""}</sub>`,
  ]
  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n")
  // the ledger goes last, after the collapsed sections (readers that drop those drop it too), and the cut leaves room for it
  const hidden = ledger.length ? `\n${ledgerCommentOf(ledger)}` : ""
  const room = maxChars - hidden.length
  return `${body.length > room ? `${body.slice(0, room)}\n\n_…cut to fit a GitHub comment._` : body}${hidden}`
}
