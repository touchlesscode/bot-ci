#!/usr/bin/env node
/**
 * staging previews, the way exo's CI does them. after the checks pass on a pull
 * request, every affected app whose wrangler config has an `env.feature` section is
 * deployed with `wrangler deploy --env feature`:
 *
 * - `${VERSION}` and `${DEPLOY_ID}` in the config are filled in first (exo's sed step).
 *   VERSION is exo's getVersionFromBranch (the last 20 chars of `<branch>-pr`), so an app's
 *   feature env names itself `<app>-${VERSION}` and routes `<app>-${VERSION}.touchlessapis.com/*`
 * - secrets the app lists in package.json `config.exo.secrets` are pushed with
 *   `wrangler secret bulk --env feature`, values taken from the repo's GitHub secrets
 * - the links go into the PR description as exo's Preview Deployments table, between
 *   its deployment-links markers; a failed deploy also gets exo's failure comment
 *
 * previews also carry the plain-text binding ORG_CI_PREVIEW=<repo>#<pr>; reapPreviews.ts
 * only ever deletes workers with that binding, so exo's own previews are never touched.
 *
 *   node deployPreviews.ts   (in the action; cwd = the checked-out repo)
 *
 * env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_TOKEN, GITHUB_EVENT_PATH,
 * GITHUB_REPOSITORY, GITHUB_HEAD_REF, GITHUB_SHA, NX_BASE, ORG_CI_NX (true|false),
 * ORG_CI_PACKAGE_MANAGER, ORG_CI_SECRETS (JSON of the repo's secrets).
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

export type PreviewTarget = { label: string; root: string; config: string }

export type Skipped = { label: string; reason: string }

export type DeployStatus = "success" | "failed" | "skipped"

export type PreviewRow = { label: string; status: DeployStatus; url?: string }

type Route = string | { pattern: string; custom_domain?: boolean }

type FeatureEnv = { name?: string; routes?: Route[]; route?: Route }

const wranglerFiles = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]
const maxVersionLength = 20
export const previewMarker = "ORG_CI_PREVIEW"
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

const commandOf = (prefix: string) => prefix.split(" ")

/** nx projects affected vs a base, by root */
const affectedRootsSince = (execPrefix: string, base: string) => {
  const [command, ...prefix] = commandOf(execPrefix)
  const names = JSON.parse(execFileSync(command, [...prefix, "nx", "show", "projects", "--affected", `--base=${base}`, "--head=HEAD", "--json"], { encoding: "utf8" })) as string[]
  return names.map((name) => (JSON.parse(execFileSync(command, [...prefix, "nx", "show", "project", name, "--json"], { encoding: "utf8" })) as { root: string }).root)
}

/** exo's affected set: vs nx-set-shas' base and vs HEAD~1, deduplicated */
const affectedRootsOf = (execPrefix: string) => {
  const bases = [process.env.NX_BASE || "origin/HEAD", "HEAD~1"]
  return [...new Set(bases.flatMap((base) => {
    try {
      return affectedRootsSince(execPrefix, base)
    } catch {
      return []
    }
  }))]
}

/** wrangler from the workspace when it's installed, else a pinned npx download */
const wranglerCommandOf = (execPrefix: string, root: string) =>
  existsSync("node_modules/.bin/wrangler") || existsSync(join(root, "node_modules/.bin/wrangler")) ? [...commandOf(execPrefix), "wrangler"] : ["npx", "--yes", "wrangler@4"]

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

/** deploy one app's feature env and push its secrets; returns its row */
const deployTarget = (target: PreviewTarget, context: { execPrefix: string; version: string; deployId: string; marker: string; secrets: Record<string, string | undefined> }): PreviewRow => {
  const text = fillPlaceholders(readFileSync(target.config, "utf8"), context)
  writeFileSync(target.config, text)
  const urls = previewUrlsOf(featureEnvOf(parseJsonc(text)) ?? {})
  const packagePath = join(dirname(target.config), "package.json")
  const names = existsSync(packagePath) ? secretNamesOf(JSON.parse(readFileSync(packagePath, "utf8"))) : []
  const secrets = secretPayloadOf(names, context.secrets)
  if ("missing" in secrets) {
    console.log(`::error::${target.label}: config.exo.secrets lists ${secrets.missing.join(", ")}, which the repo doesn't have as GitHub secrets`)
    return { label: target.label, status: "failed" }
  }
  const [command, ...args] = wranglerCommandOf(context.execPrefix, target.root)
  const options = { cwd: dirname(target.config), env: { ...process.env, ENV: "feature" } }
  const config = basename(target.config)
  console.log(`::group::deploy ${target.label} (env feature, ${context.version}) → ${urls.join(", ") || "no route"}`)
  try {
    execFileSync(command, [...args, "deploy", "--config", config, "--env", "feature", "--var", `${previewMarker}:${context.marker}`], { ...options, stdio: "inherit" })
    if (names.length) execFileSync(command, [...args, "secret", "bulk", "--config", config, "--env", "feature"], { ...options, input: JSON.stringify(secrets.payload), stdio: ["pipe", "inherit", "inherit"] })
    return { label: target.label, status: "success", url: urls[0] }
  } catch {
    console.log(`::error::preview deploy failed for ${target.label}`)
    return { label: target.label, status: "failed" }
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
  const version = versionOf({ eventName: "pull_request", headRef: process.env.GITHUB_HEAD_REF || pull.head.ref, sha: process.env.GITHUB_SHA ?? "" })
  const deployId = deployIdOf(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), version)
  const execPrefix = { pnpm: "pnpm exec", yarn: "yarn", bun: "bunx", npm: "npx --no-install" }[process.env.ORG_CI_PACKAGE_MANAGER ?? "npm"] ?? "npx --no-install"
  const roots = process.env.ORG_CI_NX === "true" ? affectedRootsOf(execPrefix) : ["."]
  const { targets, skipped } = previewTargetsOf({ roots, repositoryName: repository.split("/")[1] ?? "app", exists: existsSync, readText: (path) => readFileSync(path, "utf8") })
  for (const skip of skipped) console.log(`::warning::preview skipped for ${skip.label}: ${skip.reason}`)
  if (!targets.length) return console.log("previews: no affected app has a wrangler env.feature; nothing to deploy")

  const secrets = JSON.parse(process.env.ORG_CI_SECRETS || "{}") as Record<string, string | undefined>
  const rows = targets.map((target) => deployTarget(target, { execPrefix, version, deployId, marker: `${repository}#${pull.number}`, secrets }))
  const allRows = [...rows, ...skipped.map((skip): PreviewRow => ({ label: skip.label, status: "skipped" }))]
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
