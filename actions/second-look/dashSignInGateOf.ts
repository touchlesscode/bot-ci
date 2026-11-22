import type { ProbedPreview } from "./awaitPreviews.ts"

/** the repos (by name, in the run's org) whose dash previews Second Look may sign in to */
export const dashSignInRepos = ["exo"]

/**
 * an exo pr preview of dash: `dash-<version>.touchlessapis.com`, the route exo's deploy gives a preview (its
 * wrangler.jsonc feature env; dash has `workers_dev: false`, so no workers.dev host exists). every host under that
 * name is Touchless's own, and the preview's route answers 404 anywhere but a pr preview
 */
const dashPreviewHost = /^dash-[a-z0-9-]+\.touchlessapis\.com$/

/** the bot's own dash account, the identity the preview's sign-in route gives the session */
export const dashIdentity = "bot@touchless.io"

/** sign in to `origin`, or why not (no secret value is ever part of the reason) */
export type DashSignInGate = { origin: string } | { skip: string }

/**
 * whether prepare signs the testers in to a dash preview, and which one: only with the switch on
 * (`SECOND_LOOK_DASH_SIGNIN=on`), on a beta-enabled run (the review scope), for a pr in one of `dashSignInRepos`
 * whose head is in that repo (never a fork), with the client secret and transport key set, and only for a
 * listed preview on an exo dash preview host (https). the first such preview wins.
 */
export const dashSignInGateOf = ({ switchValue, betaEnabled, repository, owner, headRepository, previews, hasClientSecret, hasTransportKey }: {
  switchValue: string | undefined
  betaEnabled: boolean
  repository: string
  owner: string
  headRepository: string | undefined
  previews: ProbedPreview[]
  hasClientSecret: boolean
  hasTransportKey: boolean
}): DashSignInGate => {
  if (switchValue?.trim().toLowerCase() !== "on") return { skip: "Dash sign-in is off (SECOND_LOOK_DASH_SIGNIN isn't on)" }
  const allowed = dashSignInRepos.map((name) => `${owner}/${name}`.toLowerCase())
  if (!allowed.includes(repository.toLowerCase())) return { skip: `Dash sign-in only covers ${allowed.join(", ")}` }
  if (!betaEnabled) return { skip: "Dash sign-in only runs for PRs in the beta scope" }
  if ((headRepository ?? "").toLowerCase() !== repository.toLowerCase()) return { skip: "the PR's head is in another repo" }
  if (!hasClientSecret || !hasTransportKey) return { skip: "Dash sign-in isn't set up (SECOND_LOOK_DASH_CLIENT_SECRET or SECOND_LOOK_SIGNIN_TRANSPORT_KEY is missing)" }
  for (const preview of previews) {
    const url = URL.canParse(preview.url) ? new URL(preview.url) : undefined
    if (url?.protocol === "https:" && dashPreviewHost.test(url.hostname)) return { origin: url.origin }
  }
  return { skip: "no Dash preview is listed" }
}
