import type { LedgerEntry } from "./types.ts"

const maxNoteChars = 300

/**
 * a summary-only finding's bullet as commentBodyOf writes it (findingLineOf, off the diff): its label, the file it
 * names when it names one, its note and source. not one linked to a line on the diff (`[…](…)`, that one has a
 * thread), and not a "Still blocking, answered in its thread" repeat (standingLinesOf: it has a thread too)
 */
const bulletPattern = /^- \*\*(Warning|Nit):\*\* (?!\[)(?!Still blocking, answered in its thread)(?:`([^`\n]+?)(?::\d+)?` )?(.+)$/gm

/**
 * the summary-only findings a second look summary (`body`: its sticky comment or its review's body) lists in its
 * visible bullets, in order: what that run found with no line on the diff to put a thread on. `sha` is the head the
 * body names (`· head <sha>`), or `unknown`
 */
export const summaryFindingsOf = (body: string | undefined): LedgerEntry[] => {
  if (!body) return []
  const sha = /· head ([0-9a-f]{7,40})/.exec(body)?.[1] ?? "unknown"
  return [...body.matchAll(bulletPattern)].map((match) => ({
    sha,
    severity: match[1] === "Warning" ? "warning" : "nit",
    file: match[2] ?? null,
    note: match[3]!.replace(/ _\([^)]*\)_$/, "").slice(0, maxNoteChars),
  }))
}
