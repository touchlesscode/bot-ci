import type { Verdict } from "./types.ts"

/** "2 warnings", "1 nit", or nothing for none */
const countOf = (count: number, noun: string) => (count ? [`${count} ${noun}${count === 1 ? "" : "s"}`] : [])

/**
 * the first line of the review and the summary comment: the call, then what's behind it, like
 * "**Second Look (beta): changes requested** · 2 warnings, 1 nit, 3 still open". `open` is earlier threads not fixed yet.
 * a pass reads "approved" only on a beta-enabled pr, where it is one; elsewhere it's "no changes requested"
 */
export const headlineOf = ({ verdict, open = 0, betaEnabled = false }: { verdict?: Verdict; open?: number; betaEnabled?: boolean }) => {
  const call = !verdict ? "couldn't finish" : verdict.verdict === "block" ? "changes requested" : betaEnabled ? "approved" : "no changes requested"
  const findings = verdict?.findings ?? []
  const counts = [
    ...countOf(findings.filter(({ severity }) => severity === "warning").length, "warning"),
    ...countOf(findings.filter(({ severity }) => severity === "nit").length, "nit"),
    ...(open ? [`${open} still open`] : []),
  ]
  return `**Second Look (beta): ${call}**${counts.length ? ` · ${counts.join(", ")}` : ""}`
}
