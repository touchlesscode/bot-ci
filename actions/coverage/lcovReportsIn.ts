import { readdirSync } from "node:fs"
import { join } from "node:path"

const skipped = new Set(["node_modules", ".git", ".nx", ".wrangler", "dist"])

/** every `coverage/lcov.info` under `root`, repo-relative and sorted, never looking inside node_modules, .git or build output */
export const lcovReportsIn = (root: string, list: (path: string) => { name: string; isDirectory: () => boolean }[] = (path) => readdirSync(path, { withFileTypes: true })): string[] => {
  const walk = (directory: string): string[] => {
    let entries: { name: string; isDirectory: () => boolean }[]
    try {
      entries = list(join(root, directory))
    } catch {
      return []
    }
    return entries.flatMap((entry) => {
      const path = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) return skipped.has(entry.name) ? [] : walk(path)
      return entry.name === "lcov.info" && directory.split("/").at(-1) === "coverage" ? [path] : []
    })
  }
  return walk("").sort()
}
