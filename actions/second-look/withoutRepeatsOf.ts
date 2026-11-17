import type { EarlierThread, Finding, SettledSpot, Verdict } from "./types.ts"

/** a re-raised point on a spot second look already answered: not posted again, but still standing when it's a warning */
export type StandingRepeat = { spot: SettledSpot; finding: Finding }

/** an earlier thread's finding is blocking unless it's labelled a nit (old-format findings count as blocking) */
const blockingThread = (thread: EarlierThread) => !/\*\*Nit:\*\*/.test(thread.finding)

/**
 * the verdict without the `dropped` repeats (findings on a spot second look already answered, routeFindingsOf.ts):
 * dropping one removes only its second post, never the objection. a dropped warning keeps a block and comes back in
 * `standing`, listed with a link to its thread; a dropped nit is gone. a block becomes a pass (`downgraded`) only when
 * nothing at all holds it up any more: no warning left or standing (the risk-tier gate's included), no earlier thread
 * still open that isn't a nit (one the reviewer skipped counts as open), and no answered thread the reviewer chose to
 * answer ("update") that isn't a nit; so only dropped nits can leave a pass. with nothing dropped the verdict is as it is
 */
export const withoutRepeatsOf = ({ verdict, dropped, threads }: { verdict: Verdict | undefined; dropped: StandingRepeat[]; threads: EarlierThread[] }) => {
  if (!verdict || !dropped.length) return { verdict, standing: [] as StandingRepeat[], downgraded: false }
  const repeats = new Set(dropped.map(({ finding }) => finding))
  const findings = verdict.findings.filter((finding) => !repeats.has(finding))
  const standing = dropped.filter(({ finding }) => finding.severity === "warning")
  const statusOf = (thread: EarlierThread) => verdict.earlier.find((call) => call.thread === thread.key)?.status ?? "open"
  const held = standing.length > 0 || findings.some((finding) => finding.severity === "warning") || threads.some((thread) =>
    blockingThread(thread) && (thread.resolvedBy ? statusOf(thread) === "update" : statusOf(thread) !== "fixed"))
  const downgraded = verdict.verdict === "block" && !held
  const summary = "No changes requested: what's left is a nit already answered in its thread."
  return { verdict: { ...verdict, findings, ...(downgraded ? { verdict: "pass" as const, summary } : {}) }, standing, downgraded }
}

/** the lines that list standing repeats once, each linking the thread where it was answered */
export const standingLinesOf = (standing: StandingRepeat[]) =>
  standing.map(({ spot, finding }) => `- **Warning:** Still blocking, answered in its thread: [\`${spot.path.split("/").at(-1)}:${spot.line}\`](${spot.url}) ${finding.note.trim()}`)
