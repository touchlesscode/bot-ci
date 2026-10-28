import type { CoverageMode } from "./types.ts"

/** repos made from app-template that many efforts share, or that hold code from before the gate: patch coverage by default */
export const defaultPatchRepos = ["apps"]

/**
 * which coverage a repo's PRs need. Build only runs in repos made from app-template, and a repo of its own
 * starts at 100% from the template, so it's `full`; one listed in `patchRepos` (the org variable
 * BOT_CI_PATCH_COVERAGE_REPOS, comma-separated names, else defaultPatchRepos) is `patch`. an explicit
 * `full` or `patch` wins, for a repo running the coverage action from its own workflow
 */
export const coverageModeOf = ({ repository, requested, patchRepos }: { repository: string; requested?: string; patchRepos?: string }): CoverageMode => {
  if (requested === "full" || requested === "patch") return requested
  const names = patchRepos?.trim() ? patchRepos.split(",").map((name) => name.trim().toLowerCase()).filter(Boolean) : defaultPatchRepos
  const name = (repository.split("/").pop() ?? "").toLowerCase()
  return names.includes(name) ? "patch" : "full"
}
