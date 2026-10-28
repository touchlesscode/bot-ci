import { mergedFilesOf } from "./mergedFilesOf.ts"
import type { FileCoverage, Tally } from "./types.ts"

/** lines, branches and functions over every file the reports cover, and the files short of 100% */
export const totalCoverageOf = (files: FileCoverage[]) => {
  const merged = mergedFilesOf(files)
  const add = (left: Tally, right: Tally): Tally => ({ found: left.found + right.found, hit: left.hit + right.hit })
  const linesOf = (file: FileCoverage): Tally => {
    const hits = Object.values(file.lines)
    return { found: hits.length, hit: hits.filter((count) => count > 0).length }
  }
  const zero: Tally = { found: 0, hit: 0 }
  const complete = (tally: Tally) => tally.hit >= tally.found
  return {
    lines: merged.map(linesOf).reduce(add, zero),
    branches: merged.map((file) => file.branches).reduce(add, zero),
    functions: merged.map((file) => file.functions).reduce(add, zero),
    short: merged.filter((file) => !complete(linesOf(file)) || !complete(file.branches) || !complete(file.functions)).map((file) => file.path).sort(),
  }
}
