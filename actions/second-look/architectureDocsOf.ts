import { dirname, posix } from "node:path"
import type { RepoSnapshot } from "./types.ts"

const rootDoc = /^(readme|architecture|agents|claude|contributing)(\.(md|mdx|markdown|txt|rst))?$/i
const nearDoc = /^(readme(\.(md|mdx|markdown|txt|rst))?|agents\.md|claude\.md|project\.json)$/i
const treeDoc = /\.(md|mdx|mdc)$/i
const docTrees = ["docs", "doc", "architecture", "adr", ".cursor/rules"]
const skippedDirectories = new Set(["node_modules", ".git", "dist", "build", ".next", ".nx", "coverage", "assets"])
const maxTreeDepth = 4

/** every doc file under `directory`, depth-first in name order, `depth` levels at most */
const treeDocsOf = (repo: RepoSnapshot, directory: string, depth = 0): string[] =>
  depth > maxTreeDepth || !repo.isDirectory(directory)
    ? []
    : repo.listDirectory(directory).flatMap((name) => {
        const path = posix.join(directory, name)
        if (repo.isDirectory(path)) return skippedDirectories.has(name) ? [] : treeDocsOf(repo, path, depth + 1)
        return treeDoc.test(name) ? [path] : []
      })

/** the directories above a repo path, nearest first, root excluded */
const ancestorsOf = (path: string): string[] => {
  const parent = dirname(path)
  return parent === "." || parent === "/" || parent === "" ? [] : [parent, ...ancestorsOf(parent)]
}

/**
 * the reading list the main reviewer starts from, in a base checkout: the
 * root docs (readme, architecture, agents, claude, contributing), then the
 * readme / agents / claude / project.json nearest each changed path, deepest
 * directory first, then everything under docs/, adr/, architecture/ and
 * .cursor/rules. de-duplicated and capped at `limit`.
 */
export const architectureDocsOf = ({ repo, changedPaths, limit = 60 }: { repo: RepoSnapshot; changedPaths: string[]; limit?: number }): string[] => {
  const root = repo.listDirectory(".").filter((name) => rootDoc.test(name) && !repo.isDirectory(name))
  const directories = [...new Set(changedPaths.flatMap(ancestorsOf))].sort((left, right) => right.split("/").length - left.split("/").length || left.localeCompare(right))
  const near = directories.flatMap((directory) => repo.listDirectory(directory).filter((name) => nearDoc.test(name)).map((name) => posix.join(directory, name)))
  const trees = docTrees.flatMap((directory) => treeDocsOf(repo, directory))
  return [...new Set([...root, ...near, ...trees])].slice(0, limit)
}
