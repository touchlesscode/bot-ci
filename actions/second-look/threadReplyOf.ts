import { footnoteOf } from "./footnoteOf.ts"
import { labelOf } from "./labelOf.ts"
import type { Family, Finding } from "./types.ts"

/** marks second look's replies under its own threads */
export const replyMarker = "<!-- touchless-second-look-reply -->"

const shaOf = (headSha: string) => `\`${headSha.slice(0, 7)}\``

/** a note as a sentence: trimmed, with a closing period when it has no end mark */
const sentenceOf = (note: string) => (/[.!?)`]$/.test(note.trim()) ? note.trim() : `${note.trim()}.`)

/**
 * the reply on a thread the reviewer judged fixed, posted once the resolve was tried, so it says what happened:
 * `resolved` false means github refused the resolve, and the thread is left for a person to close
 */
export const fixedReplyOf = ({ note, headSha, reviewer, resolved = true }: { note: string; headSha: string; reviewer: Family; resolved?: boolean }) =>
  `${replyMarker}\n**Fixed** in ${shaOf(headSha)}${note.trim() ? `: ${sentenceOf(note)}` : "."} ${resolved ? "Resolved." : "I couldn't resolve this thread myself, so it's yours to resolve."}\n\n${footnoteOf({ reviewer })}`

/** the reply on a thread that's still open, with what changed or the answer to someone's reply */
export const updateReplyOf = ({ note, headSha, reviewer }: { note: string; headSha: string; reviewer: Family }) =>
  `${replyMarker}\n**Still open** at ${shaOf(headSha)}: ${note.trim()}\n\n${footnoteOf({ reviewer })}`

/** the reply when a new finding lands on the same line as an open thread, instead of a second thread there */
export const sameSpotReplyOf = ({ finding, reviewer }: { finding: Finding; reviewer: Family }) =>
  `${replyMarker}\n${labelOf(finding.severity)} ${finding.note.trim()}\n\n${footnoteOf({ reviewer, source: finding.source })}`
