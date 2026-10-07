import { readFileSync } from "node:fs"
import type { PullRequest } from "./types.ts"

/** the pr a second look step works on, and its repo */
export type Target = { repository: string; pull: PullRequest }

/**
 * the target pr: from SECOND_LOOK_EVENT_PATH (the pr fetched by fetchPull.ts, in a dispatched run) or the
 * workflow's own pull_request event, and its repo from SECOND_LOOK_REPOSITORY, the pr's base repo, or GITHUB_REPOSITORY
 */
export const targetOf = (environment: NodeJS.ProcessEnv = process.env): Target => {
  const path = environment.SECOND_LOOK_EVENT_PATH || environment.GITHUB_EVENT_PATH || ""
  const pull = (JSON.parse(readFileSync(path, "utf8")) as { pull_request: PullRequest }).pull_request
  return { repository: environment.SECOND_LOOK_REPOSITORY || pull.base.repo?.full_name || environment.GITHUB_REPOSITORY || "", pull }
}
