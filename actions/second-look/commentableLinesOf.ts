/** per changed file, the head-side line numbers github takes a review comment on: added and context lines in the diff's hunks */
export type CommentableLines = ReadonlyMap<string, ReadonlySet<number>>

const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** a `+++ b/path` target, unquoted the way git quotes odd paths; undefined for a deleted file */
const targetPathOf = (line: string) => {
  const raw = line.slice(4).trim()
  if (raw === "/dev/null") return undefined
  const unquoted = raw.startsWith("\"") && raw.endsWith("\"") ? JSON.parse(raw) as string : raw
  return unquoted.replace(/^b\//, "")
}

/** reads a unified `git diff` into the lines an inline comment can land on */
export const commentableLinesOf = (diff: string): CommentableLines => {
  const lines = new Map<string, Set<number>>()
  let path: string | undefined
  let next = 0
  let inHunk = false
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      path = undefined
      inHunk = false
      continue
    }
    if (!inHunk && line.startsWith("+++ ")) {
      path = targetPathOf(line)
      if (path && !lines.has(path)) lines.set(path, new Set())
      continue
    }
    const header = hunkHeader.exec(line)
    if (header) {
      next = Number(header[1])
      inHunk = Boolean(path)
      continue
    }
    if (!inHunk || !path) continue
    if (line.startsWith("+") || line.startsWith(" ")) {
      lines.get(path)?.add(next)
      next += 1
    }
  }
  return lines
}
