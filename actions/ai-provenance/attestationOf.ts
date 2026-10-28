import { summaryFieldsOf } from "./summaryFieldsOf.ts"

/** the check run the touchless-bot MCP (or a bot worker) puts on a head commit it submitted */
export const attestationName = "Touchless Bot MCP"

export type CheckRun = { name: string; head_sha: string; status?: string; conclusion: string | null; app?: { slug?: string; id?: number } | null; output?: { summary?: string | null } | null }

export type Attestation = { attested: true; lane?: string; requester?: string; ticket?: string; via?: string } | { attested: false; reason: string }

/**
 * whether `headSha` carries a successful `Touchless Bot MCP` check run made
 * by the Touchless Bot App: the app slug must match (and the app id, when
 * given), so a same-named check from any other app or workflow doesn't count.
 * returns the summary's lane / requester / ticket / via lines when it does.
 */
export const attestationOf = (checkRuns: CheckRun[], headSha: string, { appSlug, appId }: { appSlug: string; appId?: number }): Attestation => {
  const named = checkRuns.filter((run) => run.name === attestationName && run.head_sha === headSha)
  if (named.length === 0) return { attested: false, reason: `no ${attestationName} check on ${headSha.slice(0, 7)}` }
  const fromApp = named.filter((run) => run.app?.slug === appSlug && (appId === undefined || run.app?.id === appId))
  if (fromApp.length === 0) return { attested: false, reason: `a ${attestationName} check on ${headSha.slice(0, 7)} exists, but not from the ${appSlug} app` }
  const passed = fromApp.find((run) => run.conclusion === "success")
  if (!passed) return { attested: false, reason: `the ${attestationName} check on ${headSha.slice(0, 7)} didn't succeed` }
  const fields = summaryFieldsOf(passed.output?.summary)
  return { attested: true, lane: fields.lane, requester: fields.requester, ticket: fields.ticket, via: fields.via }
}
