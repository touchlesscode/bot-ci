import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path"

/**
 * an lcov `SF` path as a repo-relative posix path. absolute paths are taken relative to the repo root;
 * relative ones to the project the report belongs to, the directory holding its `coverage/` folder
 * (`apps/x/coverage/lcov.info` → `apps/x`). undefined for a path outside the repo
 */
export const repoPathOf = ({ sourcePath, reportPath, repoRoot }: { sourcePath: string; reportPath: string; repoRoot: string }) => {
  const reportDirectory = dirname(reportPath)
  const projectDirectory = reportDirectory.split(sep).at(-1) === "coverage" ? dirname(reportDirectory) : reportDirectory
  const absolute = isAbsolute(sourcePath) ? sourcePath : join(isAbsolute(projectDirectory) ? projectDirectory : join(repoRoot, projectDirectory), sourcePath)
  const path = relative(repoRoot, normalize(absolute))
  if (!path || path.startsWith("..") || isAbsolute(path)) return undefined
  return path.split(sep).join("/")
}
