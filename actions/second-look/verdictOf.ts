import { jsonObjectOf } from "./jsonObjectOf.ts"
import type { Finding, ThreadFollowUp, Verdict } from "./types.ts"

const statuses = new Set(["fixed", "open", "update"])

const textOf = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback)
const stringsOf = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])

/** the main reviewer's final message → a normalized verdict; throws when there's no json object in it */
export const verdictOf = (text: string): Verdict => {
  const raw = jsonObjectOf(text)
  const findings: Finding[] = (Array.isArray(raw.findings) ? raw.findings : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((finding) => ({
      file: textOf(finding.file) || null,
      line: typeof finding.line === "number" && Number.isInteger(finding.line) ? finding.line : null,
      severity: finding.severity === "block" ? "block" : "warn",
      note: textOf(finding.note),
      source: textOf(finding.source, "general judgement") || "general judgement",
    }))
  const earlier: ThreadFollowUp[] = (Array.isArray(raw.earlier) ? raw.earlier : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof item.thread === "string" && statuses.has(String(item.status)))
    .map((item) => ({ thread: String(item.thread), status: item.status as ThreadFollowUp["status"], note: textOf(item.note) }))
  return {
    verdict: raw.verdict === "block" ? "block" : "pass",
    earlier,
    summary: textOf(raw.summary, "(no summary)"),
    intent: stringsOf(raw.intent),
    intendedArchitecture: stringsOf(raw.intendedArchitecture),
    tested: stringsOf(raw.tested),
    disagreements: stringsOf(raw.disagreements),
    findings,
  }
}
