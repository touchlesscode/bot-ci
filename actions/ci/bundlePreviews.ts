#!/usr/bin/env node
/**
 * the half of staging previews that runs the PR's code, in the checks job, which has no
 * Cloudflare token and no secrets. for every affected app with an `env.feature`, it fills in
 * `${VERSION}` / `${DEPLOY_ID}` and bundles the worker with the repo's own wrangler
 * (`wrangler deploy --dry-run --outdir`, which needs no token). the bundles, configs and
 * assets become the `bot-ci-previews` artifact; the previews job, on a fresh runner that never
 * runs PR code, checks and deploys them (deployPreviews.ts).
 *
 *   node bundlePreviews.ts   (in the action; cwd = the checked-out repo)
 *
 * env: GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_HEAD_REF, GITHUB_SHA, NX_BASE, BOT_CI_NX,
 * BOT_CI_PACKAGE_MANAGER, BOT_CI_PREVIEWS_DIRECTORY (where the artifact is staged), GITHUB_OUTPUT.
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join, resolve } from "node:path"
import { deployIdOf, fillPlaceholders, parseJsonc, previewTargetsOf, secretNamesOf, versionOf, type PreviewManifest, type PreviewTarget } from "./deployPreviews.ts"
import { effectiveAssetsOf, type WranglerConfig } from "./previewGuard.ts"

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

/** the bundle's entry file: wrangler names it after `main`, with a .js extension */
const mainFileOf = (bundleDirectory: string, main: string | undefined) => {
  const expected = `${basename(main ?? "index", extname(main ?? "index"))}.js`
  if (existsSync(join(bundleDirectory, expected))) return expected
  return readdirSync(bundleDirectory).find((file) => /\.m?js$/.test(file))
}

/** fill in and bundle one app into `<staging>/<index>/`; returns its manifest entry */
const bundleTarget = (target: PreviewTarget, index: number, context: { execPrefix: string; version: string; deployId: string; staging: string }): PreviewManifest["targets"][number] => {
  const configText = fillPlaceholders(readFileSync(target.config, "utf8"), context)
  writeFileSync(target.config, configText)
  const base = { label: target.label, index, configText }
  try {
    const packagePath = join(dirname(target.config), "package.json")
    const secretNames = existsSync(packagePath) ? secretNamesOf(JSON.parse(readFileSync(packagePath, "utf8"))) : []
    const config = parseJsonc(configText) as WranglerConfig
    const bundleDirectory = resolve(context.staging, String(index), "bundle")
    mkdirSync(bundleDirectory, { recursive: true })
    const [command, ...args] = wranglerCommandOf(context.execPrefix, target.root)
    console.log(`::group::bundle ${target.label} (env feature, ${context.version})`)
    execFileSync(command, [...args, "deploy", "--dry-run", "--config", basename(target.config), "--env", "feature", "--outdir", bundleDirectory], { cwd: dirname(target.config), env: { ...process.env, ENV: "feature" }, stdio: "inherit" })
    console.log("::endgroup::")
    const mainFile = mainFileOf(bundleDirectory, config.env?.feature?.main ?? config.main)
    if (!mainFile) return { ...base, status: "failed", reason: "wrangler's dry run wrote no .js bundle" }
    const assetsDirectory = effectiveAssetsOf(config)?.directory
    const assetsSource = assetsDirectory ? join(dirname(target.config), assetsDirectory) : undefined
    if (assetsSource && existsSync(assetsSource)) cpSync(assetsSource, resolve(context.staging, String(index), "assets"), { recursive: true, dereference: true })
    return { ...base, status: "bundled", secretNames, mainFile, hasAssets: Boolean(assetsSource && existsSync(assetsSource)) }
  } catch (error) {
    console.log("::endgroup::")
    console.log(`::error::preview bundle failed for ${target.label}: ${(error as Error).message.split("\n")[0]}`)
    return { ...base, status: "failed", reason: "the bundle failed; see the Build job log" }
  }
}

const main = () => {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request?: { number: number; head: { ref: string } } }
  const pull = event.pull_request
  if (!pull) return console.log("previews: not a pull request; nothing to bundle")
  const staging = resolve(process.env.BOT_CI_PREVIEWS_DIRECTORY || join(process.env.RUNNER_TEMP ?? "/tmp", "bot-ci-previews"))
  const repository = process.env.GITHUB_REPOSITORY ?? ""
  const version = versionOf({ eventName: "pull_request", headRef: process.env.GITHUB_HEAD_REF || pull.head.ref, sha: process.env.GITHUB_SHA ?? "" })
  const deployId = deployIdOf(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), version)
  const execPrefix = { pnpm: "pnpm exec", yarn: "yarn", bun: "bunx", npm: "npx --no-install" }[process.env.BOT_CI_PACKAGE_MANAGER ?? "npm"] ?? "npx --no-install"
  const roots = process.env.BOT_CI_NX === "true" ? affectedRootsOf(execPrefix) : ["."]
  const { targets, skipped } = previewTargetsOf({ roots, repositoryName: repository.split("/")[1] ?? "app", exists: existsSync, readText: (path) => readFileSync(path, "utf8") })
  for (const skip of skipped) console.log(`::warning::preview skipped for ${skip.label}: ${skip.reason}`)
  if (!targets.length) return console.log("previews: no affected app has a wrangler env.feature; nothing to deploy")
  mkdirSync(staging, { recursive: true })
  const manifest: PreviewManifest = { version, targets: targets.map((target, index) => bundleTarget(target, index, { execPrefix, version, deployId, staging })), skipped }
  writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "previews=true\n")
  console.log(`previews: bundled ${manifest.targets.filter((target) => target.status === "bundled").length} of ${targets.length} app(s) for the previews job`)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.log(`::error::previews: ${(error as Error).message}`)
    process.exit(1)
  }
}
