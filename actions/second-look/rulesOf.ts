import { existsSync, readFileSync } from "node:fs"

export const repoRulePaths = [".github/second-look/rules.md", ".github/arch-governor/rules.md"]

/** the repo's own rules file first, then the org default, then general judgement */
export const rulesOf = (paths: (string | undefined)[], read: (path: string) => string | undefined = (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined)) =>
  paths.reduce<string | undefined>((found, path) => found ?? (path ? read(path) : undefined), undefined) ?? "No repo-specific rules; apply general architecture judgement."
