import type { ChangedLines } from "./types.ts"

/**
 * the lines a unified diff adds or edits, by the new file's path and numbering. made for
 * `git diff --unified=0 --no-renames base...head`; deleted files and pure deletions add nothing
 */
export const addedLinesOf = (diff: string): ChangedLines => {
  const changed: ChangedLines = {}
  let path: string | undefined
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).replace(/\t.*$/, "")
      path = target === "/dev/null" ? undefined : target.replace(/^"?b\//, "").replace(/"$/, "")
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!hunk || !path) continue
    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (!count) continue
    changed[path] = [...(changed[path] ?? []), ...Array.from({ length: count }, (_, offset) => start + offset)]
  }
  return changed
}
