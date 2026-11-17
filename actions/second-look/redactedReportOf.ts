import { redactedOf } from "./redactedOf.ts"
import type { AgentReport } from "./types.ts"

/** `report` with every text field through `redactedOf`: the exact `secrets` (a dash session's cookie values) and anything credential-shaped */
export const redactedReportOf = (report: AgentReport, secrets: readonly string[] = []): AgentReport => {
  const clean = (text: string) => redactedOf(text, secrets)
  return {
    ...report,
    summary: clean(report.summary),
    ...(report.access === undefined ? {} : { access: clean(report.access) }),
    replicated: report.replicated.map((step) => ({ ...step, step: clean(step.step), command: clean(step.command), note: clean(step.note) })),
    concerns: report.concerns.map((concern) => ({ ...concern, note: clean(concern.note) })),
  }
}
