import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * copies each of `paths` as it is at `head` into `directory`, since the reviewer's checkout is the base
 * branch and it can't run git. resolves each path to its copy, or undefined when the head doesn't have
 * the file (deleted or moved). paths that climb out of the directory are skipped.
 */
export const writeHeadFiles = ({ head, paths, directory, cwd }: { head: string; paths: string[]; directory: string; cwd?: string }) =>
  new Map([...new Set(paths)].map((path): [string, string | undefined] => {
    if (path.split("/").includes("..") || path.startsWith("/")) return [path, undefined]
    try {
      const text = execFileSync("git", ["show", `${head}:${path}`], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
      const target = join(directory, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text)
      return [path, target]
    } catch {
      return [path, undefined]
    }
  }))
