import type { Verdict } from "./types.ts"

/** "2 warnings", "1 nit", or nothing for none */
const countOf = (count: number, noun: string) => (count ? [`${count} ${noun}${count === 1 ? "" : "s"}`] : [])

/**
 * the first line of the review and the summary comment: the call, then what's behind it, like
 * "**Second Look (beta): changes requested** · 2 warnings, 1 nit, 3 still open". `open` is earlier threads not fixed yet
 */
export const headlineOf = ({ verdict, open = 0 }: { verdict?: Verdict; open?: number }) => {
  const call = !verdict ? "couldn't finish" : verdict.verdict === "pass" ? "approved" : "changes requested"
  const findings = verdict?.findings ?? []
  const counts = [
    ...countOf(findings.filter(({ severity }) => severity === "warning").length, "warning"),
    ...countOf(findings.filter(({ severity }) => severity === "nit").length, "nit"),
    ...(open ? [`${open} still open`] : []),
  ]
  return `**Second Look (beta): ${call}**${counts.length ? ` · ${counts.join(", ")}` : ""}`
}
