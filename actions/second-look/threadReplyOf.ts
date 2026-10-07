import type { Finding } from "./types.ts"

/** marks second look's replies under its own threads */
export const replyMarker = "<!-- touchless-second-look-reply -->"

const shaOf = (headSha: string) => `\`${headSha.slice(0, 7)}\``

/** the reply on a thread the reviewer judged fixed, posted right before it's resolved */
export const fixedReplyOf = ({ note, headSha }: { note: string; headSha: string }) =>
  `${replyMarker}\n**Second Look (beta)** · fixed in ${shaOf(headSha)}${note.trim() ? `: ${note.trim()}` : "."} Resolving this.`

/** the reply on a thread that's still open, with what changed or the answer to someone's reply */
export const updateReplyOf = ({ note, headSha }: { note: string; headSha: string }) =>
  `${replyMarker}\n**Second Look (beta)** · still open at ${shaOf(headSha)}: ${note.trim()}`

/** the reply when a new finding lands on the same line as an open thread, instead of a second thread there */
export const sameSpotReplyOf = ({ finding, headSha }: { finding: Finding; headSha: string }) =>
  `${replyMarker}\n**Second Look (beta)** · also here, at ${shaOf(headSha)} · ${finding.severity === "block" ? "**block**" : "warn"}\n\n${finding.note}\n\n<sub>${finding.source}</sub>`
