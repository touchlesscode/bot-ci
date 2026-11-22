import { createHash } from "node:crypto"
import type { LedgerEntry } from "./types.ts"

/** the marker on a comment that answers one summary-only finding; its key is summaryAnswerKeyOf's */
const answerPattern = /<!-- touchless-second-look-answer:([0-9a-f]{12}) -->/

/**
 * one summary-only finding's key, pure: the same for its visible bullet and its ledger entry (the file it names and
 * the first 100 letters and digits of its note, case and punctuation aside), so an answer to the bullet is found
 * against the ledger on the next review
 */
export const summaryAnswerKeyOf = ({ file, note }: Pick<LedgerEntry, "file" | "note">) =>
  createHash("sha256").update(`${file ?? ""}\n${note.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 100)}`).digest("hex").slice(0, 12)

/**
 * the comment that answers a summary-only finding, which has no thread to reply in: the marker with its key, the
 * finding quoted, then the answer (`Fixed in <sha>: …` or `Not changed: <why>`). second look's conversation digest
 * reads it as that finding's answer (summaryAnswersOf)
 */
export const summaryAnswerBodyOf = ({ key, finding, words }: { key: string; finding: string; words: string }) =>
  `<!-- touchless-second-look-answer:${key} -->\n> ${finding.replace(/\s+/g, " ").trim().slice(0, 300)}\n\n${words.trim()}`

/** the answers to summary-only findings in a PR's conversation, by key, the newest kept: who wrote it, when, and its words (the quote dropped) */
export const summaryAnswersOf = (comments: readonly { author: string; body: string; createdAt: string }[]) => {
  const answers = new Map<string, { by: string; at: string; words: string }>()
  for (const comment of [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = answerPattern.exec(comment.body)?.[1]
    if (!key) continue
    const words = comment.body.replace(answerPattern, "").split("\n").filter((line) => !line.startsWith(">")).join(" ").trim()
    answers.set(key, { by: comment.author, at: comment.createdAt, words })
  }
  return answers
}
