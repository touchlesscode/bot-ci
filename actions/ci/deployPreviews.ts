#!/usr/bin/env node
/**
 * staging previews, the way exo's CI does them, deployed by the previews job: a fresh
 * runner that never checks out or runs the PR's code. the checks job already filled in
 * `${VERSION}` / `${DEPLOY_ID}` and bundled every affected app with an `env.feature`
 * (bundlePreviews.ts, no secrets there); this job takes that artifact as data and:
 *
 * - refuses any app whose worker isn't `<app>-<version>` or whose routes aren't
 *   `<app>-<version>.<zone>` (previewGuard.ts), so a PR can't deploy over prod
 * - deploys the prebuilt bundle with a pinned wrangler installed outside any checkout
 *   (`no_bundle`, no build command), with a config it writes itself
 * - pushes the secrets the app lists in package.json `config.exo.secrets` with
 *   `wrangler secret bulk --env feature`, never infra secrets (Cloudflare, model keys)
 * - writes exo's Preview Deployments table into the PR description; a failed deploy also
 *   gets exo's failure comment
 *
 * previews also carry the plain-text binding BOT_CI_PREVIEW=<repo>#<pr>; reapPreviews.ts
 * only ever deletes workers with that binding, so exo's own previews are never touched.
 *
 *   node deployPreviews.ts   (in the deploy-previews action)
 *
 * env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_TOKEN, GITHUB_EVENT_PATH,
 * GITHUB_REPOSITORY, GITHUB_HEAD_REF, BOT_CI_PREVIEWS_DIRECTORY (the downloaded artifact),
 * BOT_CI_WRANGLER (the pinned wrangler binary), BOT_CI_PREVIEW_ZONE, BOT_CI_SECRETS (JSON of the repo's secrets).
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { deployConfigOf, infraSecretsIn, previewProblemsOf, type WranglerConfig } from "./previewGuard.ts"

export type PreviewTarget = { label: string; root: string; config: string }

export type Skipped = { label: string; reason: string }

export type DeployStatus = "success" | "failed" | "skipped"

export type PreviewRow = { label: string; status: DeployStatus; url?: string }

/** what the checks job hands the previews job: per app, its filled-in config and how it bundled */
export type PreviewManifest = {
  version: string
  targets: { label: string; index: number; configText: string; status: "bundled" | "failed"; reason?: string; secretNames?: string[]; mainFile?: string; hasAssets?: boolean }[]
  skipped: Skipped[]
}

type Route = string | { pattern: string; custom_domain?: boolean }

type FeatureEnv = { name?: string; routes?: Route[]; route?: Route }

const wranglerFiles = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]
const maxVersionLength = 20
export const previewMarker = "BOT_CI_PREVIEW"
export const linksStart = "<!-- deployment-links:start -->"
export const linksEnd = "<!-- deployment-links:end -->"
export const failureCommentOf = (runUrl: string) => `❌ Feature branch deployment failed. Please check the [workflow log](${runUrl}) for more details.`

/**
 * exo's getVersionFromBranch: `<head ref>-pr` on pull requests, `<sha7>-mq` in the merge
 * queue; lowercased, dependabot reduced to its last segment, `./_` → `-`, the last 20
 * characters, no leading dashes, `main` → `latest`. anything else outside a-z0-9- also
 * becomes `-` so the result is always a dns label.
 */
export const versionOf = ({ eventName, headRef, sha }: { eventName: string; headRef: string; sha: string }) => {
  const raw = (eventName === "merge_group" ? `${sha.slice(0, 7)}-mq` : `${headRef}-pr`).toLowerCase()
  const version = (raw.startsWith("dependabot/") ? raw.split("/").pop() ?? raw : raw).replace(/[^a-z0-9-]/g, "-").slice(-maxVersionLength).replace(/^-+/, "")
  return version === "main" ? "latest" : version
}

/** exo's get-deploy-id: `<sha12>-<version>` */
export const deployIdOf = (sha: string, version: string) => `${sha.slice(0, 12)}-${version}`

/** JSON with comments and trailing commas, as wrangler.jsonc allows; comment markers inside strings are kept */
export const parseJsonc = (text: string) => {
  let output = ""
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      output += character
      if (character === "\\") output += text[++index] ?? ""
      else if (character === '"') inString = false
    } else if (character === '"') {
      inString = true
      output += character
    } else if (text.startsWith("//", index)) {
      const end = text.indexOf("\n", index)
      index = (end === -1 ? text.length : end) - 1
    } else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2)
      index = (end === -1 ? text.length : end + 2) - 1
    } else output += character
  }
  return JSON.parse(output.replace(/,(\s*[}\]])/g, "$1")) as unknown
}

/** exo's placeholder fill: every `${VERSION}` and `${DEPLOY_ID}` in the file */
export const fillPlaceholders = (text: string, values: { version: string; deployId: string }) => text.replaceAll("${VERSION}", values.version).replaceAll("${DEPLOY_ID}", values.deployId)

/** the first wrangler config in a directory */
export const wranglerConfigOf = (root: string, exists: (path: string) => boolean) =>
  wranglerFiles.map((file) => (root === "." ? file : join(root, file))).find(exists)

/** the feature env of a parsed wrangler config, if it has one */
export const featureEnvOf = (config: unknown) => (config as { env?: { feature?: FeatureEnv } } | undefined)?.env?.feature

/** the https urls a feature env's routes and custom domains serve (wildcard and path-only patterns dropped) */
export const previewUrlsOf = (feature: FeatureEnv) =>
  [...(feature.routes ?? []), ...(feature.route ? [feature.route] : [])]
    .map((route) => (typeof route === "string" ? route : route.pattern).replace(/^[a-z]+:\/\//, "").split("/")[0] ?? "")
    .filter((host) => host && !host.includes("*"))
    .map((host) => `https://${host}`)

/** the apps to preview: affected nx projects (or the repo root) whose wrangler config has an env.feature */
export const previewTargetsOf = ({ roots, repositoryName, exists, readText }: { roots: string[]; repositoryName: string; exists: (path: string) => boolean; readText: (path: string) => string }) =>
  roots.reduce<{ targets: PreviewTarget[]; skipped: Skipped[] }>((result, root) => {
    const config = wranglerConfigOf(root, exists)
    const label = root === "." ? repositoryName : basename(root)
    if (!config) return result
    const skip = (reason: string) => ({ ...result, skipped: [...result.skipped, { label, reason }] })
    if (config.endsWith(".toml")) return skip(`${config}: previews need a wrangler.jsonc with an env.feature section (exo's layout; see app-template)`)
    try {
      if (!featureEnvOf(parseJsonc(readText(config)))) return skip(`${config} has no env.feature section, so there's nothing to deploy a preview from (exo's layout; see app-template)`)
    } catch (error) {
      return skip(`${config} doesn't parse: ${(error as Error).message}`)
    }
    return { ...result, targets: [...result.targets, { label, root, config }] }
  }, { targets: [], skipped: [] })

/** the secret names an app's package.json lists in `config.exo.secrets` (exo's convention) */
export const secretNamesOf = (packageJson: unknown) => {
  const csv = (packageJson as { config?: { exo?: { secrets?: string } } } | undefined)?.config?.exo?.secrets ?? ""
  const names = csv.split(",").map((name) => name.trim()).filter(Boolean)
  const invalid = names.find((name) => !/^[A-Z_][A-Z0-9_]*$/.test(name))
  if (invalid) throw new Error(`config.exo.secrets: "${invalid}" isn't an env var name`)
  return names
}

/** the bulk-upload payload, or the names that are missing from the repo's secrets */
export const secretPayloadOf = (names: string[], available: Record<string, string | undefined>) => {
  const missing = names.filter((name) => !available[name])
  return missing.length ? { missing } : { payload: Object.fromEntries(names.map((name) => [name, available[name] as string])) }
}

const statusIcon: Record<DeployStatus, string> = { success: "🟢", failed: "🔴", skipped: "⚪" }
const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

/** exo's Preview Deployments block: a 30/70 html table with a status dot per app, between the markers */
export const previewBlockOf = (rows: PreviewRow[], now: Date) => {
  const tableRows = rows.map(({ label, status, url }, index) => {
    const urlCell = status === "success" && url ? `<a href="${url}">${url}</a>` : "—"
    const appSpacer = index === 0 ? `<img src="${transparentPixel}" width="300" height="1" alt="">` : ""
    const urlSpacer = index === 0 ? `<img src="${transparentPixel}" width="700" height="1" alt="">` : ""
    return `<tr><td nowrap valign="middle">${statusIcon[status]} <strong>${label}</strong>${appSpacer}</td><td valign="middle">${urlCell}${urlSpacer}</td></tr>`
  })
  const lastUpdated = now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")
  return [linksStart, "", "## Preview Deployments", "", "<table>", "<thead>", '<tr><th align="left">Application</th><th align="left">Preview&nbsp;URL</th></tr>', "</thead>", "<tbody>", ...tableRows, "</tbody>", "</table>", "", `<sub><i>Last updated: ${lastUpdated}</i></sub>`, "", linksEnd].join("\n")
}

/** the description with its deployment-links block replaced, or appended when there is none */
export const upsertPreviewBlock = (body: string, block: string) => {
  const pattern = new RegExp(`${linksStart}[\\s\\S]*?${linksEnd}`)
  return pattern.test(body) ? body.replace(pattern, () => block) : `${body.trimEnd()}\n\n${block}\n`
}

const githubHeaders = () => ({ authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json" })

/** set the PR description's preview block through the API */
const updatePullBody = async (repository: string, number: number, block: string) => {
  const api = `${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${repository}/pulls/${number}`
  const current = (await (await fetch(api, { headers: githubHeaders() })).json()) as { body?: string | null }
  const body = upsertPreviewBlock(current.body ?? "", block)
  if (body === (current.body ?? "")) return
  const response = await fetch(api, { method: "PATCH", headers: githubHeaders(), body: JSON.stringify({ body }) })
  if (!response.ok) console.log(`::warning::couldn't update the PR description (${response.status}); the links are in the job summary`)
}

/** exo's failure comment on the PR */
const commentFailure = async (repository: string, number: number) => {
  const runUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
  await fetch(`${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${repository}/issues/${number}/comments`, { method: "POST", headers: githubHeaders(), body: JSON.stringify({ body: failureCommentOf(runUrl) }) })
}

/** a label safe to show in the PR description */
const safeLabelOf = (label: string) => label.replace(/[^\w.-]/g, "-").slice(0, 60) || "app"

/** check one bundled app, then deploy it and push its secrets; returns its row */
const deployTarget = (target: PreviewManifest["targets"][number], context: { wrangler: string; artifact: string; version: string; zone: string; marker: string; secrets: Record<string, string | undefined> }): PreviewRow => {
  const label = safeLabelOf(target.label)
  const fail = (reason: string): PreviewRow => {
    console.log(`::error::preview not deployed for ${label}: ${reason}`)
    return { label, status: "failed" }
  }
  if (target.status !== "bundled" || !target.mainFile) return fail(target.reason ?? "it didn't bundle")
  if (!Number.isInteger(target.index) || target.index < 0) return fail("its bundle index isn't a number")
  if (!/^[\w.-]+\.m?js$/.test(target.mainFile)) return fail(`"${target.mainFile}" isn't a bundle file name`)
  let config: WranglerConfig
  try {
    config = parseJsonc(target.configText) as WranglerConfig
  } catch (error) {
    return fail(`its wrangler config doesn't parse: ${(error as Error).message}`)
  }
  const problems = previewProblemsOf({ config, version: context.version, zone: context.zone })
  if (problems.length) return fail(problems.join("; "))
  const names = target.secretNames ?? []
  const infra = infraSecretsIn(names)
  if (infra.length) return fail(`config.exo.secrets lists ${infra.join(", ")}; infra secrets never go into a preview`)
  const secrets = secretPayloadOf(names, context.secrets)
  if ("missing" in secrets) return fail(`config.exo.secrets lists ${secrets.missing.join(", ")}, which the repo doesn't have as GitHub secrets`)
  const source = join(context.artifact, String(target.index))
  const stage = mkdtempSync(join(process.env.RUNNER_TEMP ?? "/tmp", "bot-ci-deploy-"))
  cpSync(join(source, "bundle"), join(stage, "bundle"), { recursive: true })
  const hasAssets = Boolean(target.hasAssets) && existsSync(join(source, "assets"))
  if (hasAssets) cpSync(join(source, "assets"), join(stage, "assets"), { recursive: true })
  writeFileSync(join(stage, "wrangler.json"), JSON.stringify(deployConfigOf(config, { mainFile: target.mainFile, hasAssets }), null, 2))
  const urls = previewUrlsOf(config.env?.feature ?? {})
  const options = { cwd: stage, env: { ...process.env, ENV: "feature" } }
  console.log(`::group::deploy ${label} (env feature, ${context.version}) → ${urls.join(", ") || "no route"}`)
  try {
    execFileSync(context.wrangler, ["deploy", "--config", "wrangler.json", "--env", "feature", "--var", `${previewMarker}:${context.marker}`], { ...options, stdio: "inherit" })
    if (names.length) execFileSync(context.wrangler, ["secret", "bulk", "--config", "wrangler.json", "--env", "feature"], { ...options, input: JSON.stringify(secrets.payload), stdio: ["pipe", "inherit", "inherit"] })
    return { label, status: "success", url: urls[0] }
  } catch {
    console.log(`::error::preview deploy failed for ${label}`)
    return { label, status: "failed" }
  } finally {
    console.log("::endgroup::")
  }
}

const main = async () => {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request?: { number: number; head: { ref: string } }; sender?: { login?: string } }
  const pull = event.pull_request
  if (!pull) return console.log("previews: not a pull request; nothing to deploy")
  if (event.sender?.login === "dependabot[bot]") return console.log("previews: dependabot PRs don't deploy (as in exo)")
  const repository = process.env.GITHUB_REPOSITORY ?? ""
  const artifact = process.env.BOT_CI_PREVIEWS_DIRECTORY ?? ""
  const manifestPath = join(artifact, "manifest.json")
  if (!existsSync(manifestPath)) return console.log("previews: no bundles from the checks job; nothing to deploy")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PreviewManifest
  const version = versionOf({ eventName: "pull_request", headRef: process.env.GITHUB_HEAD_REF || pull.head.ref, sha: "" })
  if (manifest.version !== version) console.log(`::warning::the bundles were filled in for "${manifest.version}", not "${version}"; the guard checks against "${version}"`)
  const zone = process.env.BOT_CI_PREVIEW_ZONE || "touchlessapis.com"
  const wrangler = process.env.BOT_CI_WRANGLER ?? ""
  if (!existsSync(wrangler)) throw new Error(`no pinned wrangler at "${wrangler}"`)
  mkdirSync(process.env.RUNNER_TEMP ?? "/tmp", { recursive: true })
  const secrets = JSON.parse(process.env.BOT_CI_SECRETS || "{}") as Record<string, string | undefined>
  const rows = manifest.targets.map((target) => deployTarget(target, { wrangler, artifact, version, zone, marker: `${repository}#${pull.number}`, secrets }))
  const allRows = [...rows, ...manifest.skipped.map((skip): PreviewRow => ({ label: safeLabelOf(skip.label), status: "skipped" }))]
  await updatePullBody(repository, pull.number, previewBlockOf(allRows, new Date()))
  const failed = rows.filter((row) => row.status === "failed")
  if (failed.length) await commentFailure(repository, pull.number)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Preview Deployments (${version})\n${allRows.map((row) => `- ${statusIcon[row.status]} ${row.label}${row.url ? `: ${row.url}` : ""}`).join("\n")}\n`)
  if (failed.length) process.exit(1)
}

if (import.meta.main) main().catch((error: Error) => {
  console.log(`::error::previews: ${error.message}`)
  process.exit(1)
})
