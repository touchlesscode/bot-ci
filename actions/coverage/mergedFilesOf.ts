import type { FileCoverage } from "./types.ts"

/**
 * one entry per path, for reports that cover the same file twice (a shared module tested from two
 * projects): hits add up, and a branch or function only counts as missed when no report ran it
 */
export const mergedFilesOf = (files: FileCoverage[]): FileCoverage[] => {
  const byPath = new Map<string, FileCoverage[]>()
  for (const file of files) byPath.set(file.path, [...(byPath.get(file.path) ?? []), file])
  return [...byPath.values()].map((group) => {
    if (group.length === 1) return group[0]!
    const lines: Record<number, number> = {}
    for (const file of group) for (const [line, hits] of Object.entries(file.lines)) lines[Number(line)] = (lines[Number(line)] ?? 0) + hits
    const best = (pick: (file: FileCoverage) => { found: number; hit: number }) => group.map(pick).reduce((left, right) => (right.hit / (right.found || 1) > left.hit / (left.found || 1) ? right : left))
    const missedByAll = (pick: (file: FileCoverage) => number[]) => group.map(pick).reduce((left, right) => left.filter((line) => right.includes(line)))
    return { path: group[0]!.path, lines, branchMisses: missedByAll((file) => file.branchMisses), functionMisses: missedByAll((file) => file.functionMisses), branches: best((file) => file.branches), functions: best((file) => file.functions) }
  })
}
