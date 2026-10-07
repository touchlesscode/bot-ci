import type { CommentableLines } from "./commentableLinesOf.ts"
import type { Finding } from "./types.ts"

/** marks second look's own inline comments, so a re-run can tell them apart */
export const findingMarker = "<!-- touchless-second-look-finding -->"

/** one comment in a github pull request review, on the head side of the diff */
export type InlineComment = { path: string; line: number; side: "RIGHT"; body: string }

/** the comment text for a finding pinned to its line */
export const inlineBodyOf = (finding: Finding) =>
  `${findingMarker}\n**Second Look (beta)** · ${finding.severity === "block" ? "**block**" : "warn"}\n\n${finding.note}\n\n<sub>${finding.source}</sub>`

/** strips a leading `./` or `/` the reviewer might put on a repo path */
const repoPathOf = (file: string) => file.replace(/^\.?\//, "")

/**
 * splits the reviewer's findings into the ones that can sit on a line of the diff
 * (`inline`) and the rest, which only the summary comment carries
 */
export const inlineCommentsOf = ({ findings, commentable }: { findings: Finding[]; commentable: CommentableLines }) =>
  findings.reduce<{ inline: { finding: Finding; comment: InlineComment }[]; rest: Finding[] }>((split, finding) => {
    const path = finding.file ? repoPathOf(finding.file) : ""
    const fits = Boolean(path) && finding.line !== null && Boolean(commentable.get(path)?.has(finding.line))
    return fits
      ? { ...split, inline: [...split.inline, { finding, comment: { path, line: finding.line as number, side: "RIGHT", body: inlineBodyOf(finding) } }] }
      : { ...split, rest: [...split.rest, finding] }
  }, { inline: [], rest: [] })
