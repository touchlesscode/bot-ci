import type { CommentableLines } from "./commentableLinesOf.ts"
import { footnoteOf } from "./footnoteOf.ts"
import { labelOf } from "./labelOf.ts"
import type { Family, Finding } from "./types.ts"

/** marks second look's own inline comments, so a re-run can tell them apart */
export const findingMarker = "<!-- touchless-second-look-finding -->"

/** one comment in a github pull request review, on the head side of the diff */
export type InlineComment = { path: string; line: number; side: "RIGHT"; body: string }

/** the comment text for a finding pinned to its line: `**Warning:** the note`, then the footnote */
export const inlineBodyOf = (finding: Finding, reviewer: Family) =>
  `${findingMarker}\n${labelOf(finding.severity)} ${finding.note.trim()}\n\n${footnoteOf({ reviewer, source: finding.source })}`

/** strips a leading `./` or `/` the reviewer might put on a repo path */
const repoPathOf = (file: string) => file.replace(/^\.?\//, "")

/**
 * splits the reviewer's findings into the ones that can sit on a line of the diff
 * (`inline`) and the rest, which only the summary comment carries
 */
export const inlineCommentsOf = ({ findings, commentable, reviewer }: { findings: Finding[]; commentable: CommentableLines; reviewer: Family }) =>
  findings.reduce<{ inline: { finding: Finding; comment: InlineComment }[]; rest: Finding[] }>((split, finding) => {
    const path = finding.file ? repoPathOf(finding.file) : ""
    const fits = Boolean(path) && finding.line !== null && Boolean(commentable.get(path)?.has(finding.line))
    return fits
      ? { ...split, inline: [...split.inline, { finding, comment: { path, line: finding.line as number, side: "RIGHT", body: inlineBodyOf(finding, reviewer) } }] }
      : { ...split, rest: [...split.rest, finding] }
  }, { inline: [], rest: [] })
