import { isSourcePath } from "./isSourcePath.ts"
import { lineRangesOf } from "./lineRangesOf.ts"
import { patchCoverageOf, type FileLines } from "./patchCoverageOf.ts"
import { percentOf } from "./percentOf.ts"
import { totalCoverageOf } from "./totalCoverageOf.ts"
import type { ChangedLines, CoverageMode, CoverageVerdict, FileCoverage } from "./types.ts"

const listLimit = 25

const fileLinesOf = (label: string, files: FileLines[]) =>
  files.length ? [`${label}:`, ...files.slice(0, listLimit).map((file) => `- \`${file.path}\`: ${lineRangesOf(file.lines)}`), ...(files.length > listLimit ? [`- and ${files.length - listLimit} more file(s)`] : [])] : []

const detailLinesOf = (patch: ReturnType<typeof patchCoverageOf>) => [
  ...fileLinesOf("Changed lines that never ran", patch.uncovered),
  ...fileLinesOf("Changed lines with a branch that never ran", patch.uncoveredBranches),
  ...fileLinesOf("Changed lines starting a function no test called", patch.uncalledFunctions),
  ...unreportedLinesOf(patch.unreported),
]

const unreportedLinesOf = (paths: string[]) =>
  paths.length ? [`No coverage report mentions these changed source files, so they weren't measured (add them to the project's coverage \`include\`, or test them):`, ...paths.slice(0, listLimit).map((path) => `- \`${path}\``)] : []

/**
 * the gate's verdict for one PR. `full` needs every line, branch and function the reports cover at 100%;
 * `patch` needs every changed line a report instruments to have run, with its branches and functions. no report at all
 * fails, unless the PR changes no source code (nx affected ran no project's tests)
 */
export const coverageVerdictOf = ({ mode, files, changed, reports }: { mode: CoverageMode; files: FileCoverage[]; changed: ChangedLines; reports: number }): CoverageVerdict => {
  const patch = patchCoverageOf({ files, changed })
  const changedSource = Object.keys(changed).filter(isSourcePath)
  const noReport = "No coverage report (`coverage/lcov.info`). The app template's `test:coverage` writes one per project: vitest with the `lcov` reporter."
  const noSource = { passed: true, lines: [`**${mode === "full" ? "Coverage" : "Patch coverage"}**: passed: no coverage report, and the PR changes no source code`] }
  if (mode === "full") {
    if (!reports) return changedSource.length ? { passed: false, lines: ["**Coverage (full, 100%)**: failed", noReport] } : noSource
    const total = totalCoverageOf(files)
    const passed = [total.lines, total.branches, total.functions].every((tally) => tally.hit >= tally.found)
    return {
      passed,
      lines: [
        `**Coverage (full, 100%)**: ${passed ? "passed" : "failed"}: lines ${percentOf(total.lines)}% (${total.lines.hit}/${total.lines.found}), branches ${percentOf(total.branches)}% (${total.branches.hit}/${total.branches.found}), functions ${percentOf(total.functions)}% (${total.functions.hit}/${total.functions.found})`,
        ...(total.short.length ? ["Short of 100%:", ...total.short.slice(0, listLimit).map((path) => `- \`${path}\``)] : []),
        ...detailLinesOf(patch),
      ],
    }
  }
  if (!reports) return changedSource.length ? { passed: false, lines: ["**Patch coverage (100% of changed lines)**: failed", noReport] } : noSource
  const passed = !patch.uncovered.length && !patch.uncoveredBranches.length && !patch.uncalledFunctions.length
  const countOf = (fileLines: FileLines[]) => fileLines.reduce((count, file) => count + file.lines.length, 0)
  const extras = [patch.uncoveredBranches.length ? `${countOf(patch.uncoveredBranches)} with a branch that didn't` : "", patch.uncalledFunctions.length ? `${countOf(patch.uncalledFunctions)} starting a function nothing called` : ""].filter(Boolean)
  return {
    passed,
    lines: [
      `**Patch coverage (100% of changed lines)**: ${passed ? "passed" : "failed"}: ${patch.covered} of ${patch.measured} changed line(s) ran${extras.length ? `, ${extras.join(", ")}` : ""}`,
      ...detailLinesOf(patch),
    ],
  }
}
