import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { RepoSnapshot } from "./types.ts"

/** a read-only snapshot of the real directory `root` */
export const directorySnapshot = (root: string): RepoSnapshot => ({
  exists: (path) => existsSync(join(root, path)),
  isDirectory: (path) => existsSync(join(root, path)) && statSync(join(root, path)).isDirectory(),
  listDirectory: (path) => (existsSync(join(root, path)) ? readdirSync(join(root, path)).sort() : []),
})
