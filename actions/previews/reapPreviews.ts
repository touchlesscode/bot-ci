#!/usr/bin/env node
/**
 * nightly preview reaper, run in the org-ci repo on a schedule. exo deletes its
 * previews when the PR closes; required workflows never see a PR close, so this
 * deletes org-ci previews that haven't been redeployed for ORG_CI_PREVIEW_TTL_DAYS
 * (default 7) instead. an open PR gets its preview back on its next push. only
 * workers named `*-pr` that carry the ORG_CI_PREVIEW binding are touched — exo's
 * own previews never are. a reaped worker's routes on the preview zone go with it.
 *
 *   node actions/previews/reapPreviews.ts [--dry-run]
 *
 * env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, ORG_CI_PREVIEW_ZONE, ORG_CI_PREVIEW_TTL_DAYS.
 */
export type Script = { id: string; modified_on: string }

export type Binding = { type: string; name: string; text?: string }

export type Route = { id: string; pattern: string; script?: string }

const dayMilliseconds = 86_400_000

/** preview-named workers last deployed before the cutoff */
export const staleCandidatesOf = (scripts: Script[], now: number, ttlDays: number) =>
  scripts.filter((script) => script.id.endsWith("-pr") && now - Date.parse(script.modified_on) > ttlDays * dayMilliseconds)

/** whether org-ci deployed this worker (exo's previews have no such binding) */
export const isOrgCiPreview = (bindings: Binding[]) => bindings.some((binding) => binding.type === "plain_text" && binding.name === "ORG_CI_PREVIEW")

/** the zone routes pointing at a worker */
export const routesOf = (routes: Route[], script: string) => routes.filter((route) => route.script === script)

type Envelope<T> = { success: boolean; errors: unknown[]; result: T }

/** one Cloudflare API call; throws on failure */
const cloudflare = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" } })
  const envelope = (await response.json()) as Envelope<T>
  if (!envelope.success) throw new Error(`${init.method ?? "GET"} ${path}: ${JSON.stringify(envelope.errors)}`)
  return envelope.result
}

const main = async () => {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!account || !process.env.CLOUDFLARE_API_TOKEN) throw new Error("the org-ci repo needs the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets (the ones exo deploys with)")
  const dryRun = process.argv.includes("--dry-run")
  const ttlDays = Number(process.env.ORG_CI_PREVIEW_TTL_DAYS || 7)
  const zoneName = process.env.ORG_CI_PREVIEW_ZONE || "touchlessapis.com"
  const [zone] = await cloudflare<{ id: string }[]>(`/zones?name=${encodeURIComponent(zoneName)}`)
  const routes = zone ? await cloudflare<Route[]>(`/zones/${zone.id}/workers/routes`) : []
  const candidates = staleCandidatesOf(await cloudflare<Script[]>(`/accounts/${account}/workers/scripts`), Date.now(), ttlDays)
  let reaped = 0
  for (const script of candidates) {
    const settings = await cloudflare<{ bindings?: Binding[] }>(`/accounts/${account}/workers/scripts/${script.id}/settings`)
    if (!isOrgCiPreview(settings.bindings ?? [])) continue
    const own = routesOf(routes, script.id)
    console.log(`${dryRun ? "would delete" : "delete"} ${script.id} (last deploy ${script.modified_on}; ${own.map((route) => route.pattern).join(", ") || "no route"})`)
    if (dryRun) continue
    for (const route of own) await cloudflare(`/zones/${zone!.id}/workers/routes/${route.id}`, { method: "DELETE" })
    await cloudflare(`/accounts/${account}/workers/scripts/${script.id}?force=true`, { method: "DELETE" })
    reaped += 1
  }
  console.log(`reaped ${reaped} preview worker(s) older than ${ttlDays} days`)
}

if (import.meta.main) main().catch((error: Error) => {
  console.log(`::error::reaper: ${error.message}`)
  process.exit(1)
})
