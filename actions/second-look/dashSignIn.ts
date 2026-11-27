#!/usr/bin/env node
/**
 * second look, in prepare (a trusted job: never runs pr code, holds the client secret): signs the testers in to the
 * pr's dash preview as the bot's account. it asks auth for a core-api access token for Second Look's own read-only
 * client (client credentials), hands it to the preview's sign-in route (`POST /auth/second-look`, bearer), which
 * answers with a session cookie for bot@touchless.io, checks that cookie reaches a signed-in page, and seals the
 * cookie with the transport key into the `dash-session` output for the testers. the token and the cookie are masked in
 * the log and never written to the bundle; only a note (signed in or why not) goes into previews.json. off unless
 * `dashSignInGateOf` lets it through; never fails the job.
 *
 *   node dashSignIn.ts
 *
 * env: SECOND_LOOK_DASH_SIGNIN (on), SECOND_LOOK_BETA_ENABLED, SECOND_LOOK_EVENT_PATH, SECOND_LOOK_PREVIEWS_FILE,
 * GITHUB_REPOSITORY_OWNER, SECOND_LOOK_DASH_CLIENT_ID, SECOND_LOOK_DASH_CLIENT_SECRET, SECOND_LOOK_DASH_AUTH_URL
 * (default https://auth.touchless.io), SECOND_LOOK_DASH_AUDIENCE (default https://core-api.touchless.io),
 * SECOND_LOOK_SIGNIN_TRANSPORT_KEY, GITHUB_OUTPUT.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import type { PreviewsFile } from "./awaitPreviews.ts"
import { betaEnabledOf } from "./betaEnabledOf.ts"
import { coreApiTokenOf } from "./coreApiTokenOf.ts"
import { dashIdentity, dashSignInGateOf } from "./dashSignInGateOf.ts"
import { sealedOf } from "./sealedOf.ts"
import { sessionCookiesOf, type SessionCookie } from "./sessionCookiesOf.ts"
import { signedInPageOf } from "./signedInPageOf.ts"
import { targetOf } from "./targetOf.ts"

/** the preview route that turns Second Look's access token into a dash session (exo's side: see the README) */
export const dashSignInPath = "/auth/second-look"

/** what the testers learn about the sign-in: never a cookie or token */
export type DashSignInNote = NonNullable<PreviewsFile["signIn"]>

/** the sealed session's plaintext, which only the tester's harness opens */
export type DashSession = { origin: string; identity: string; cookies: SessionCookie[] }

/** what `signInToDash` did; `mask` lists the values to hide from the log, `sealed` is the output for the testers */
export type DashSignInResult = { note: DashSignInNote; sealed?: string; mask: string[] }

const failed = (note: string, origin: string, mask: string[] = []): DashSignInResult => ({ note: { status: "failed", note, origin }, mask })

/** signs in to the gated dash preview and seals its session; every failure becomes a note */
export const signInToDash = async ({ fetch = globalThis.fetch, environment, previews, repository, headRepository }: {
  fetch?: typeof globalThis.fetch
  environment: NodeJS.ProcessEnv
  previews: PreviewsFile
  repository: string
  headRepository: string | undefined
}): Promise<DashSignInResult> => {
  const clientSecret = environment.SECOND_LOOK_DASH_CLIENT_SECRET ?? ""
  const transportKey = environment.SECOND_LOOK_SIGNIN_TRANSPORT_KEY ?? ""
  const gate = dashSignInGateOf({
    switchValue: environment.SECOND_LOOK_DASH_SIGNIN,
    betaEnabled: betaEnabledOf(environment.SECOND_LOOK_BETA_ENABLED),
    repository,
    owner: environment.GITHUB_REPOSITORY_OWNER ?? "",
    headRepository,
    previews: previews.previews,
    hasClientSecret: Boolean(clientSecret && environment.SECOND_LOOK_DASH_CLIENT_ID),
    hasTransportKey: Boolean(transportKey),
  })
  if ("skip" in gate) return { note: { status: "skipped", note: gate.skip }, mask: [] }
  const { origin } = gate
  const mask: string[] = []
  try {
    const minted = await coreApiTokenOf({
      fetch,
      authUrl: environment.SECOND_LOOK_DASH_AUTH_URL || "https://auth.touchless.io",
      clientId: environment.SECOND_LOOK_DASH_CLIENT_ID ?? "",
      clientSecret,
      audience: environment.SECOND_LOOK_DASH_AUDIENCE || "https://core-api.touchless.io",
    })
    if ("error" in minted) return failed(`couldn't get Second Look's token: ${minted.error}`, origin)
    mask.push(minted.token)
    const response = await fetch(new URL(dashSignInPath, origin), { method: "POST", headers: { authorization: `Bearer ${minted.token}` }, redirect: "manual", signal: AbortSignal.timeout(15_000) })
    const cookies = sessionCookiesOf(response.headers.getSetCookie(), origin)
    mask.push(...cookies.map((cookie) => cookie.value))
    if (response.status >= 400 || !cookies.length) return failed(`${origin}${dashSignInPath} answered ${response.status}${cookies.length ? "" : " with no session cookie"} (does the preview have the sign-in route?)`, origin, mask)
    const page = await signedInPageOf({ fetch, origin, cookies })
    if (!page.ok) return failed(page.note, origin, mask)
    const session: DashSession = { origin, identity: dashIdentity, cookies }
    return { note: { status: "signed-in", note: `signed in to ${origin} as ${dashIdentity}`, origin, identity: dashIdentity }, sealed: sealedOf(JSON.stringify(session), transportKey), mask }
  } catch (error) {
    return failed(`sign-in to ${origin} failed: ${(error as Error).message}`, origin, mask)
  }
}

const main = async () => {
  const previewsPath = process.env.SECOND_LOOK_PREVIEWS_FILE ?? ""
  const previews = JSON.parse(readFileSync(previewsPath, "utf8")) as PreviewsFile
  const { repository, pull } = targetOf()
  const result = await signInToDash({ environment: process.env, previews, repository, headRepository: pull.head.repo?.full_name })
  for (const value of result.mask) console.log(`::add-mask::${value}`)
  writeFileSync(previewsPath, JSON.stringify({ ...previews, signIn: result.note }, null, 2))
  if (result.sealed && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dash-session=${result.sealed}\n`)
  console.log(`dash sign-in: ${result.note.status}, ${result.note.note}`)
}

if (import.meta.main) await main().catch((error: Error) => console.log(`::warning title=Second Look::dash sign-in skipped: ${error.message}`))
