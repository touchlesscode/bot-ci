import { execFileSync } from "node:child_process"

export type GitDiff = { diff: string; stat: string; changedPaths: string[] }

const git = (args: string[], cwd?: string) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

/** the pr's change as `base...head`: the diff, its stat and the changed paths (renames by their new path) */
export const gitDiffOf = ({ base, head, cwd }: { base: string; head: string; cwd?: string }): GitDiff => ({
  diff: git(["diff", "--no-color", `${base}...${head}`], cwd),
  stat: git(["diff", "--no-color", "--stat=160", `${base}...${head}`], cwd),
  changedPaths: git(["diff", "--name-only", "--no-renames", `${base}...${head}`], cwd).split("\n").filter(Boolean),
})

/** a diff cut to `maxChars`, with whether it was cut */
export const cappedDiffOf = (diff: string, maxChars: number) => ({ text: diff.slice(0, maxChars), truncated: diff.length > maxChars })
