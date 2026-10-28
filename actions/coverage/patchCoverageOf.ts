import { isSourcePath } from "./isSourcePath.ts"
import { mergedFilesOf } from "./mergedFilesOf.ts"
import type { ChangedLines, FileCoverage } from "./types.ts"

/** lines in one file */
export type FileLines = { path: string; lines: number[] }

/**
 * patch coverage: of the lines a change adds or edits, the ones a coverage report instruments (blank
 * lines, comments and types aren't), which never ran, which have a branch that never ran, and which start a
 * function that was never called. `unreported` lists changed source files no report mentions at all, which
 * coverage can't speak for (a file no test imports, unless the project's coverage `include` lists it)
 */
export const patchCoverageOf = ({ files, changed, isSource = isSourcePath }: { files: FileCoverage[]; changed: ChangedLines; isSource?: (path: string) => boolean }) => {
  const byPath = new Map(mergedFilesOf(files).map((file) => [file.path, file]))
  const uncovered: FileLines[] = []
  const uncoveredBranches: FileLines[] = []
  const uncalledFunctions: FileLines[] = []
  const unreported: string[] = []
  let measured = 0
  for (const [path, lines] of Object.entries(changed).sort(([left], [right]) => left.localeCompare(right))) {
    const file = byPath.get(path)
    if (!file) {
      if (isSource(path)) unreported.push(path)
      continue
    }
    const instrumented = lines.filter((line) => file.lines[line] !== undefined)
    measured += instrumented.length
    const missed = instrumented.filter((line) => file.lines[line] === 0)
    if (missed.length) uncovered.push({ path, lines: missed })
    const branchMissed = lines.filter((line) => file.branchMisses.includes(line))
    if (branchMissed.length) uncoveredBranches.push({ path, lines: branchMissed })
    const uncalled = lines.filter((line) => file.functionMisses.includes(line))
    if (uncalled.length) uncalledFunctions.push({ path, lines: uncalled })
  }
  const missedCount = uncovered.reduce((count, file) => count + file.lines.length, 0)
  return { measured, covered: measured - missedCount, uncovered, uncoveredBranches, uncalledFunctions, unreported }
}
