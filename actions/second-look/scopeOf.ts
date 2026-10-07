import { isSampled } from "./isSampled.ts"
import type { Request } from "./requestOf.ts"
import type { PullRequest, ScopeDecision } from "./types.ts"

export const forceMarker = "<!-- second-look -->"
export const defaultBotLogins = ["touchless-bot[bot]"]
export const optInHint = "opt-in: comment `@touchless-bot run this` on the PR to get one"

/** comma list → trimmed, lowercased logins */
export const loginsOf = (value: string | undefined) =>
  (value ?? "").split(",").map((login) => login.trim().toLowerCase()).filter(Boolean)

/**
 * whether a pr gets a second look. opt-in during beta, in order:
 * - an org member's latest `@touchless-bot …` comment turns it on (even on a draft) or off (`stop`);
 * - the `<!-- second-look -->` marker in the body turns it on;
 * - drafts wait for their next push after ready (rulesets ignore `types`, so there's no ready_for_review run);
 * - `[bot]` authors (dependency updates and the like) and `skipAuthors` are skipped, the touchless bot excepted;
 * - with `sampleEvery` ≥ 1 the rest are sampled 1 in that many, otherwise they wait for a request.
 * out-of-scope prs pass rather than skip, because a ruleset-required workflow has to conclude successfully.
 */
export const scopeOf = ({ pull, repository, request, sampleEvery = 0, skipAuthors = [], botLogins = defaultBotLogins }: {
  pull: PullRequest
  repository: string
  request?: Request
  sampleEvery?: number
  skipAuthors?: string[]
  botLogins?: string[]
}): ScopeDecision => {
  const author = (pull.user?.login ?? "").toLowerCase()
  if (request?.state === "on") return { run: true, reason: `requested by @${request.by}` }
  if ((pull.body ?? "").includes(forceMarker)) return { run: true, reason: `forced by the ${forceMarker} marker` }
  if (request?.state === "off") return { run: false, reason: `switched off by @${request.by}; mention @touchless-bot again to turn it back on` }
  if (pull.draft) return { run: false, reason: "draft; Second Look runs on the next push after it's marked ready" }
  if (author.endsWith("[bot]") && !botLogins.map((login) => login.toLowerCase()).includes(author)) return { run: false, reason: `${author} is a bot (dependency updates and the like get no Second Look)` }
  if (skipAuthors.includes(author)) return { run: false, reason: `${author} is on SECOND_LOOK_SKIP_AUTHORS` }
  if (sampleEvery < 1) return { run: false, reason: optInHint }
  const rate = sampleEvery === 1 ? "every PR" : `1 in ${sampleEvery}`
  return isSampled({ repository, number: pull.number, every: sampleEvery })
    ? { run: true, reason: `sampled (${rate})` }
    : { run: false, reason: `not sampled (${rate}); ${optInHint}` }
}
