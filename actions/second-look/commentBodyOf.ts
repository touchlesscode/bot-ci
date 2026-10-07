import type { AgentReport, Family, Finding, Harness, Verdict } from "./types.ts"

export const commentMarker = "<!-- touchless-second-look -->"

const familyName: Record<Family, string> = { anthropic: "Anthropic", openai: "OpenAI" }
const resultLabel = { pass: "pass", fail: "**fail**", couldnt: "couldn't" }
const maxSteps = 25
const maxChars = 60_000

/** a markdown table cell: one line, no pipes, capped */
const cellOf = (text: string, max = 300) => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").slice(0, max) || " "

const locationOf = (file: string | null, line: number | null) => (file ? `\`${file}${line ? `:${line}` : ""}\` ` : "")

/** a finding's summary line; one that also sits on the diff says so, linking the review when there's a new one */
const findingLineOf = (onDiff: ReadonlySet<Finding>, reviewUrl?: string) => (finding: Finding) =>
  `- ${finding.severity === "block" ? "**block**" : "warn"} ${locationOf(finding.file, finding.line)}${finding.note} _(${finding.source})_${onDiff.has(finding) ? ` · ${reviewUrl ? `[on the diff](${reviewUrl})` : "on the diff"}` : ""}`

/** "3 pass, 1 fail, 2 couldn't", or why the tester has nothing */
const tallyOf = (report: AgentReport) => {
  if (report.status !== "ran") return report.status === "skipped" ? "didn't run" : "crashed"
  const count = (result: string) => report.replicated.filter((step) => step.result === result).length
  return [`${count("pass")} pass`, `${count("fail")} fail`, `${count("couldnt")} couldn't`].join(", ")
}

/** one tester's collapsed section: summary, the steps table, its concerns */
const reportSectionOf = (report: AgentReport) => {
  const steps = report.replicated.slice(0, maxSteps)
  return [
    `<details><summary>${familyName[report.family]} tester · ${report.model} · ${tallyOf(report)}</summary>`,
    "",
    `${report.summary}${report.status === "ran" ? ` _(confidence: ${report.confidence})_` : ""}`,
    ...(steps.length ? ["", "| Step | Command | Result | Note |", "| --- | --- | --- | --- |", ...steps.map((step) => `| ${cellOf(step.step, 120)} | \`${cellOf(step.command, 200)}\` | ${resultLabel[step.result]} | ${cellOf(step.note)} |`)] : []),
    ...(report.replicated.length > maxSteps ? [`_…and ${report.replicated.length - maxSteps} more steps_`] : []),
    ...(report.concerns.length ? ["", "Concerns:", ...report.concerns.map((concern) => `- ${locationOf(concern.file, concern.line)}${concern.note}`)] : []),
    "",
    "</details>",
  ]
}

const headlineOf = (verdict: Verdict | undefined, enforcing: boolean) => {
  if (!verdict) return "couldn't finish"
  if (verdict.verdict === "pass") return "passed"
  return enforcing ? "blocked" : "would block"
}

/**
 * the sticky comment: the verdict line, the main reviewer's summary, how the pr
 * matches its ticket, what was verified, tester disagreements and findings up top; each tester's steps and
 * the intended architecture it read collapsed below. `error` replaces the
 * verdict when the main reviewer didn't answer. findings in `onDiff` are also inline comments on the
 * diff, in the review at `reviewUrl`.
 */
export const commentBodyOf = ({ verdict, error, reports, reviewer, reviewerModel, harness, enforcing, headSha, scopeReason, onDiff = new Set(), reviewUrl }: {
  verdict?: Verdict
  error?: string
  reports: AgentReport[]
  reviewer: Family
  reviewerModel: string
  harness: Harness | undefined
  enforcing: boolean
  headSha: string
  scopeReason: string
  onDiff?: ReadonlySet<Finding>
  reviewUrl?: string
}) => {
  const cost = reports.reduce((total, report) => total + (report.costUsd ?? 0), 0)
  const lines = [
    commentMarker,
    `**Second Look (beta): ${headlineOf(verdict, enforcing)}**${enforcing ? "" : " · advisory, doesn't fail the check"}`,
    "",
    verdict ? verdict.summary : `The main reviewer didn't answer: ${error ?? "unknown error"}. The testers' reports are below.`,
    ...(verdict?.intent.length ? ["", "**Against the ticket**", ...verdict.intent.map((line) => `- ${line}`)] : []),
    ...(verdict?.tested.length ? ["", "**What was verified**", ...verdict.tested.map((line) => `- ${line}`)] : []),
    ...(verdict?.disagreements.length ? ["", "**Where the testers disagree**", ...verdict.disagreements.map((line) => `- ${line}`)] : []),
    ...(verdict?.findings.length ? ["", "**Findings**", ...verdict.findings.map(findingLineOf(onDiff, reviewUrl))] : []),
    "",
    ...reports.flatMap(reportSectionOf),
    ...(verdict?.intendedArchitecture.length ? ["<details><summary>Intended architecture, as read from the docs</summary>", "", ...verdict.intendedArchitecture.map((line) => `- ${line}`), "", "</details>"] : []),
    "",
    `<sub>Main reviewer: ${familyName[reviewer]} (${reviewerModel})${harness ? ` reviewing ${harness} work` : ""} · head ${headSha.slice(0, 7)} · ${scopeReason}${cost ? ` · Anthropic tester cost $${cost.toFixed(2)}` : ""}</sub>`,
  ]
  const body = lines.join("\n")
  return body.length > maxChars ? `${body.slice(0, maxChars)}\n\n_…cut to fit a GitHub comment._` : body
}
