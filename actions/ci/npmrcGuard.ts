#!/usr/bin/env node
/**
 * runs before a pnpm/npm install that gets PACKAGES_READ_TOKEN. the token lives in setup-node's
 * own userconfig, keyed to npm.pkg.github.com, and the install runs with lifecycle scripts and
 * pnpmfiles off. what's left for a PR is its own package-manager config, so this refuses any that
 * could hand the token to another host or run code during the install:
 * - auth settings or `${…}` env interpolation in .npmrc (`//evil/:_authToken=${NODE_AUTH_TOKEN}`)
 * - an `@touchlesscode` registry other than GitHub Packages
 * - npm/pnpm settings that run code or swap the config files (node-options, script-shell, pnpmfile, …)
 * - a `packageManager` that isn't a plain `<name>@<version>` (pnpm downloads and runs that version)
 *
 *   node npmrcGuard.ts   (in the action, cwd = the checked-out repo; exit 1 with ::error lines)
 */
import { directorySnapshot, type RepoSnapshot } from "./planChecks.ts"

const githubPackages = /^https:\/\/npm\.pkg\.github\.com\/?$/
const authKey = /(?:^|[:\s])(?:_authToken|_auth|_password|username|email|certfile|keyfile)\s*=/
const codeKeys = /^\s*(?:node-options|script-shell|shell|pnpmfile|global-pnpmfile|userconfig|globalconfig|init-module|onload-script|git)\s*=/
const packageManagerPattern = /^(?:npm|pnpm|yarn|bun)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+sha(?:1|224|256|384|512)\.[0-9a-f]+)?$/

/** problems in one .npmrc, by line */
export const npmrcProblemsOf = (text: string, path = ".npmrc") =>
  text.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) return []
    const where = `${path}:${index + 1}`
    const scope = /^@touchlesscode:registry\s*=\s*(\S+)/.exec(trimmed)
    return [
      authKey.test(trimmed) ? `${where} sets registry auth; credentials come from CI, never the repo` : undefined,
      /\$\{/.test(trimmed) ? `${where} interpolates an environment variable` : undefined,
      codeKeys.test(trimmed) ? `${where} sets ${trimmed.split("=")[0]!.trim()}, which can run code during install` : undefined,
      scope && !githubPackages.test(scope[1]!) ? `${where} points @touchlesscode at ${scope[1]} instead of https://npm.pkg.github.com` : undefined,
    ].filter((problem): problem is string => problem !== undefined)
  })

/** every reason the packages token must not reach this repo's install; empty when it's safe */
export const packagesTokenProblemsOf = (repo: RepoSnapshot) => {
  const npmrc = repo.readText(".npmrc")
  const workspace = repo.readText("pnpm-workspace.yaml") ?? ""
  let packageManager: unknown
  try {
    packageManager = (JSON.parse(repo.readText("package.json") ?? "{}") as { packageManager?: unknown }).packageManager
  } catch {
    packageManager = undefined
  }
  return [
    ...(npmrc ? npmrcProblemsOf(npmrc) : []),
    /^\s*(?:pnpmfile|globalPnpmfile|npmrcAuthFile|configDependencies)\s*:/m.test(workspace) ? "pnpm-workspace.yaml sets a pnpmfile, auth file or config dependencies, which can run code during install" : undefined,
    /npm\.pkg\.github\.com|_authToken|\$\{/.test(workspace) ? "pnpm-workspace.yaml carries registry auth or env interpolation" : undefined,
    packageManager !== undefined && (typeof packageManager !== "string" || !packageManagerPattern.test(packageManager)) ? `package.json packageManager "${String(packageManager)}" isn't <name>@<version>` : undefined,
  ].filter((problem): problem is string => problem !== undefined)
}

if (import.meta.main) {
  const problems = packagesTokenProblemsOf(directorySnapshot(process.cwd()))
  for (const problem of problems) console.log(`::error::Build: ${problem}`)
  if (problems.length) {
    console.log("Build: refusing to install @touchlesscode/* packages with this config (infra/bot-ci/README.md \"Packages\")")
    process.exit(1)
  }
  console.log("Build: package-manager config ok for the packages token")
}
