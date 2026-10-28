import type { FileCoverage } from "./types.ts"

type Parsing = FileCoverage & { functionLines: Map<string, number>; functionHits: Set<string>; summary: Partial<Record<"FNF" | "FNH" | "BRF" | "BRH", number>> }

const emptyFile = (path: string): Parsing => ({
  path,
  lines: {},
  branchMisses: [],
  functionMisses: [],
  branches: { found: 0, hit: 0 },
  functions: { found: 0, hit: 0 },
  functionLines: new Map(),
  functionHits: new Set(),
  summary: {},
})

const sortedUnique = (lines: number[]) => [...new Set(lines)].sort((left, right) => left - right)

/**
 * the files in an lcov report (`SF` … `end_of_record`), with their paths as written. lines come from `DA`,
 * branches from `BRDA` (a `-` or `0` taken count is a miss), functions from `FN`/`FNDA`; a report's own
 * `FNF`/`FNH`/`BRF`/`BRH` totals win when it has them. anything else is ignored
 */
export const lcovFilesOf = (text: string): FileCoverage[] => {
  const files: FileCoverage[] = []
  let current: Parsing | undefined
  const finish = () => {
    if (!current) return
    const { functionLines, functionHits, summary, ...file } = current
    files.push({
      ...file,
      branchMisses: sortedUnique(file.branchMisses),
      functionMisses: sortedUnique([...functionLines].filter(([name]) => !functionHits.has(name)).map(([, line]) => line)),
      branches: { found: summary.BRF ?? file.branches.found, hit: summary.BRH ?? file.branches.hit },
      functions: { found: summary.FNF ?? functionLines.size, hit: summary.FNH ?? functionHits.size },
    })
    current = undefined
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const colon = line.indexOf(":")
    const key = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? "" : line.slice(colon + 1)
    if (key === "SF") {
      finish()
      current = emptyFile(value)
    } else if (key === "end_of_record") finish()
    else if (!current) continue
    else if (key === "DA") {
      const [lineNumber, hits] = value.split(",").map(Number)
      if (Number.isInteger(lineNumber) && Number.isFinite(hits)) current.lines[lineNumber!] = (current.lines[lineNumber!] ?? 0) + hits!
    } else if (key === "BRDA") {
      const [lineNumber, , , taken] = value.split(",")
      current.branches.found += 1
      if (taken === "-" || Number(taken) === 0) current.branchMisses.push(Number(lineNumber))
      else current.branches.hit += 1
    } else if (key === "FN") {
      const [lineNumber, ...name] = value.split(",")
      current.functionLines.set(name.join(","), Number(lineNumber))
    } else if (key === "FNDA") {
      const [hits, ...name] = value.split(",")
      if (Number(hits) > 0) current.functionHits.add(name.join(","))
    } else if (key === "FNF" || key === "FNH" || key === "BRF" || key === "BRH") current.summary[key] = Number(value)
  }
  finish()
  return files
}
