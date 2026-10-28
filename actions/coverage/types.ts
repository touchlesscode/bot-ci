/** found vs hit, for one kind of thing coverage counts */
export type Tally = { found: number; hit: number }

/** one source file's coverage from an lcov report; `lines` maps a line number to its hit count */
export type FileCoverage = {
  path: string
  lines: Record<number, number>
  /** lines with at least one branch that never ran */
  branchMisses: number[]
  /** lines where a function that was never called starts (v8 counts a one-line function's line as run when it's defined) */
  functionMisses: number[]
  branches: Tally
  functions: Tally
}

/** the lines a change adds or edits, per repo-relative path (the new file's numbering) */
export type ChangedLines = Record<string, number[]>

/**
 * `full`: everything the reports cover has to be 100% (repos on the app template).
 * `patch`: only the lines the PR adds or edits have to be covered (shared repos, older code)
 */
export type CoverageMode = "full" | "patch"

/** BOT_CI_COVERAGE: `enforce` fails Build, `evaluate` (the default) only reports, `off` skips the gate */
export type CoverageEnforcement = "enforce" | "evaluate" | "off"

/** what the gate found: whether it passes, and markdown lines for the job summary */
export type CoverageVerdict = { passed: boolean; lines: string[] }
