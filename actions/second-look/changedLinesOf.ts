/** second look reviews a pr only when github's additions plus deletions stay at or under this */
export const maxChangedLines = 5_000

/** lines a pr changes, github's additions plus deletions; undefined when github didn't report both */
export const changedLinesOf = ({ additions, deletions }: { additions?: number; deletions?: number }) =>
  typeof additions === "number" && typeof deletions === "number" && Number.isInteger(additions) && Number.isInteger(deletions) && additions >= 0 && deletions >= 0
    ? additions + deletions
    : undefined

/** the line count when it's over the limit; undefined when the pr is reviewable, or when its size isn't known */
export const overLimitOf = (pull: { additions?: number; deletions?: number }) => {
  const changed = changedLinesOf(pull)
  return changed !== undefined && changed > maxChangedLines ? changed : undefined
}
