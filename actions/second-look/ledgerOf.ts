import { summaryFindingsOf } from "./summaryFindingsOf.ts"
import type { Finding, LedgerEntry } from "./types.ts"

const ledgerPattern = /<!-- touchless-second-look-ledger:([A-Za-z0-9_-]*) -->/
const maxEntries = 20
const maxNoteChars = 300

/**
 * the summary-only findings earlier runs left in second look's summary comment (`body`), newest first: its
 * hidden ledger, or, in a comment from before the ledger, the bullets that aren't linked to a line on the diff
 */
export const ledgerOf = (body: string | undefined): LedgerEntry[] => {
  if (!body) return []
  const encoded = ledgerPattern.exec(body)?.[1]
  if (encoded !== undefined) {
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown
      return Array.isArray(parsed) ? parsed.filter((entry): entry is LedgerEntry => typeof entry?.note === "string" && typeof entry?.sha === "string").slice(0, maxEntries) : []
    } catch {
      return []
    }
  }
  // a comment from before the ledger: its visible summary-only bullets (summaryFindingsOf)
  return summaryFindingsOf(body)
}

/** this run's summary-only `findings` at `sha` ahead of the `earlier` ledger, exact repeats dropped, capped at 20 */
export const nextLedgerOf = ({ earlier, findings, sha }: { earlier: LedgerEntry[]; findings: Finding[]; sha: string }): LedgerEntry[] => {
  const fresh = findings.map((finding) => ({ sha: sha.slice(0, 7), severity: finding.severity, file: finding.file, note: finding.note.trim().slice(0, maxNoteChars) }))
  const keyOf = (entry: LedgerEntry) => `${entry.file ?? ""}\n${entry.note}`
  const seen = new Set<string>()
  return [...fresh, ...earlier].filter((entry) => !seen.has(keyOf(entry)) && Boolean(seen.add(keyOf(entry)))).slice(0, maxEntries)
}

/** the ledger as a hidden line for the summary comment (base64url json, so no `-->` can end it early); nothing when empty */
export const ledgerCommentOf = (ledger: LedgerEntry[]) =>
  ledger.length ? `<!-- touchless-second-look-ledger:${Buffer.from(JSON.stringify(ledger.slice(0, maxEntries))).toString("base64url")} -->` : ""
