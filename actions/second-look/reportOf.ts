import { jsonObjectOf } from "./jsonObjectOf.ts"
import type { AgentReport, Concern, Family, ReplicatedStep } from "./types.ts"

const textOf = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback)
const lineOf = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : null)
const arrayOf = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [])
const results = new Set(["pass", "fail", "couldnt"])
const confidences = new Set(["high", "medium", "low"])

/** a report for a tester that never got to test (no key, the job didn't run) */
export const skippedReportOf = (family: Family, model: string, reason: string): AgentReport =>
  ({ family, model, status: "skipped", summary: reason, confidence: "low", replicated: [], concerns: [] })

/** a report for a tester that started but didn't answer (crash, timeout, bad json) */
export const crashedReportOf = (family: Family, model: string, reason: string): AgentReport =>
  ({ family, model, status: "crashed", summary: reason, confidence: "low", replicated: [], concerns: [] })

/** a tester's final message → a normalized report; anything unparseable becomes a crashed report that says why */
export const reportOf = ({ family, model, text, costUsd }: { family: Family; model: string; text: string; costUsd?: number }): AgentReport => {
  try {
    const raw = jsonObjectOf(text)
    const replicated: ReplicatedStep[] = arrayOf(raw.replicated).map((step) => ({
      step: textOf(step.step),
      command: textOf(step.command),
      result: results.has(textOf(step.result)) ? (textOf(step.result) as ReplicatedStep["result"]) : "couldnt",
      note: textOf(step.note),
    }))
    const concerns: Concern[] = arrayOf(raw.concerns).map((concern) => ({ file: textOf(concern.file) || null, line: lineOf(concern.line), note: textOf(concern.note) }))
    const confidence = confidences.has(textOf(raw.confidence)) ? (textOf(raw.confidence) as AgentReport["confidence"]) : "low"
    return { family, model, status: "ran", summary: textOf(raw.summary, "(no summary)"), confidence, replicated, concerns, ...(costUsd === undefined ? {} : { costUsd }) }
  } catch (error) {
    return crashedReportOf(family, model, `the ${family} tester's answer didn't parse: ${(error as Error).message}`)
  }
}

/** a report read back from its artifact file, or a skipped one when the file is missing or broken */
export const storedReportOf = (family: Family, text: string | undefined): AgentReport => {
  if (!text) return skippedReportOf(family, "unknown", `the ${family} tester didn't report (its job was skipped, cancelled or failed before writing)`)
  try {
    const stored = JSON.parse(text) as AgentReport
    return stored && stored.family === family ? stored : skippedReportOf(family, "unknown", `the ${family} report is for another family`)
  } catch {
    return skippedReportOf(family, "unknown", `the ${family} report file isn't json`)
  }
}
