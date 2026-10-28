#!/usr/bin/env node
/**
 * org ci planner: decides what the org-wide required ci runs in a checked-out repo.
 * nothing when the repo wasn't made from app-template (it's for the bot's repos), already has its own
 * pull request ci, or isn't a node project.
 * nx workspaces get exo's pipeline: `nx affected -t build|lint|typecheck|test` against
 * nx-set-shas' base, with the local nx cache. other node repos get install plus the
 * lint / typecheck / test / build scripts they declare. a root `test:coverage` script adds a
 * coverage check for the coverage gate (actions/coverage), and a root `test:e2e` turns on the E2E job.
 *
 *   node planChecks.ts   (in the action, cwd = the checked-out repo; writes $GITHUB_OUTPUT)
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

export type PackageJson = { scripts?: Record<string, string>; engines?: { node?: string }; packageManager?: string }

export type Check = { name: string; command: string }

export type CheckPlan =
  /** `failed` is a plan that couldn't be made, not a repo with nothing to do: the job fails instead of passing green */
  | { skip: true; reason: string; failed?: true }
  | {
      skip: false
      reason: string
      packageManager: PackageManager
      locked: boolean
      nx: boolean
      pnpmVersion?: string
      nodeVersion?: string
      nodeVersionFile?: string
      install: string
      /** lifecycle scripts the install skipped, run after it without the packages token */
      postinstall: string
      /** the install may get PACKAGES_READ_TOKEN: only pnpm and npm, whose installs run no repo code with scripts off */
      packagesToken: boolean
      checks: Check[]
      /** the root declares `test:e2e`, so the E2E job runs it against each preview Previews deploys */
      e2e: boolean
    }

/** read-only view of the checked-out repo, injectable for tests */
export type RepoSnapshot = {
  exists: (path: string) => boolean
  listDirectory: (path: string) => string[]
  readText: (path: string) => string | undefined
}

/** other ci systems' config at the repo root (actions/ci-plan's sparse checkout lists the same paths) */
export const otherCiFiles = [".buildkite", ".circleci", "codefresh.yml", ".gitlab-ci.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml", ".travis.yml", "Jenkinsfile"]
const typecheckScripts = ["typecheck", "type-check", "check-types", "tsc"]
const nxTargets = ["build", "lint", "typecheck", "test"]
const placeholderTest = /no test specified/
const defaultPnpmVersion = "12"
/** the root script that runs the unit tests with coverage (app-template: vitest `--coverage`, lcov reporter) */
export const coverageScript = "test:coverage"
/** the root script that runs Playwright against PREVIEW_URL, which the E2E job runs per previewed app */
export const e2eScript = "test:e2e"

/** the repo's own ci, if any: a github workflow that runs on pull requests, or another ci system's config */
export const ownCiOf = (repo: RepoSnapshot): string | undefined => {
  const workflows = repo.exists(".github/workflows") ? repo.listDirectory(".github/workflows").filter((name) => /\.ya?ml$/.test(name)) : []
  const pullRequestWorkflow = workflows.find((name) => /\bpull_request(_target)?\b/.test(repo.readText(join(".github/workflows", name)) ?? ""))
  if (pullRequestWorkflow) return `.github/workflows/${pullRequestWorkflow}`
  return otherCiFiles.find((path) => repo.exists(path))
}

/** the package manager from `packageManager`, else the lockfile, else npm */
export const packageManagerOf = (repo: RepoSnapshot, packageJson: PackageJson): { packageManager: PackageManager; locked: boolean } => {
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(packageJson.packageManager ?? "")?.[1] as PackageManager | undefined
  const lockfiles: [PackageManager, string[]][] = [["pnpm", ["pnpm-lock.yaml"]], ["yarn", ["yarn.lock"]], ["bun", ["bun.lock", "bun.lockb"]], ["npm", ["package-lock.json", "npm-shrinkwrap.json"]]]
  const fromLock = lockfiles.find(([, files]) => files.some((file) => repo.exists(file)))?.[0]
  const packageManager = declared ?? fromLock ?? "npm"
  return { packageManager, locked: lockfiles.find(([manager]) => manager === packageManager)![1].some((file) => repo.exists(file)) }
}

/**
 * the install command; pnpm itself comes from pnpm/action-setup, yarn from corepack. pnpm and npm
 * install with lifecycle scripts (and pnpm's .pnpmfile.cjs) off, because they get the packages
 * token; postinstallOf runs the skipped scripts afterwards, without it.
 */
export const installCommandOf = (packageManager: PackageManager, locked: boolean, yarnBerry: boolean) => {
  if (packageManager === "pnpm") return `pnpm install${locked ? " --frozen-lockfile" : ""} --ignore-scripts --ignore-pnpmfile`
  if (packageManager === "yarn") return `corepack enable && yarn install${locked ? (yarnBerry ? " --immutable" : " --frozen-lockfile") : ""}`
  if (packageManager === "bun") return `npm install -g bun && bun install${locked ? " --frozen-lockfile" : ""}`
  return locked ? "npm ci --ignore-scripts --no-audit --no-fund" : "npm install --ignore-scripts --no-audit --no-fund"
}

const rootLifecycleScripts = ["preinstall", "install", "postinstall", "prepare"]

/** the dependency build scripts and the root's own install lifecycle that a scripts-off install skipped */
export const postinstallOf = (packageManager: PackageManager, scripts: Record<string, string> = {}) => {
  if (packageManager !== "pnpm" && packageManager !== "npm") return ""
  return [`${packageManager} rebuild`, ...rootLifecycleScripts.filter((script) => scripts[script]).map((script) => `${packageManager} run ${script}`)].join(" && ")
}

/** how to run a locally installed binary with each package manager */
export const execPrefixOf = (packageManager: PackageManager) => ({ pnpm: "pnpm exec", yarn: "yarn", bun: "bunx", npm: "npx --no-install" })[packageManager]

/** lint, the first typecheck-style script, a real test script, `test:coverage` (the coverage gate's reports) and build, in that order */
export const checksOf = (packageManager: PackageManager, scripts: Record<string, string> = {}): Check[] => {
  const run = (script: string) => `${packageManager} run ${script}`
  const typecheck = typecheckScripts.find((script) => scripts[script])
  return [
    scripts.lint ? { name: "lint", command: run("lint") } : undefined,
    typecheck ? { name: "typecheck", command: run(typecheck) } : undefined,
    scripts.test && !placeholderTest.test(scripts.test) ? { name: "test", command: run("test") } : undefined,
    scripts[coverageScript] ? { name: "coverage", command: run(coverageScript) } : undefined,
    scripts.build ? { name: "build", command: run("build") } : undefined,
  ].filter((check): check is Check => check !== undefined)
}

/**
 * exo's order: build first (lint and test depend on it), only the projects affected since NX_BASE. a root
 * `test:coverage` script (app-template has one) adds `nx affected -t test:coverage`, whose lcov reports
 * the coverage gate reads
 */
export const nxChecksOf = (packageManager: PackageManager, scripts: Record<string, string> = {}): Check[] => [
  ...nxTargets.map((target) => ({ name: target, command: `${execPrefixOf(packageManager)} nx affected -t ${target}` })),
  ...(scripts[coverageScript] ? [{ name: "coverage", command: `${execPrefixOf(packageManager)} nx affected -t ${coverageScript}` }] : []),
]

/** the node version source: a version file when the repo pins one, else node 24 */
export const nodeVersionOf = (repo: RepoSnapshot, packageJson: PackageJson): { nodeVersion?: string; nodeVersionFile?: string } => {
  const file = [".nvmrc", ".node-version"].find((path) => repo.exists(path))
  if (file) return { nodeVersionFile: file }
  if (packageJson.engines?.node) return { nodeVersionFile: "package.json" }
  return { nodeVersion: "24" }
}

/**
 * the whole plan for one repo. `botBuilt` is the template lineage (templateLineage.ts): true for a repo made from
 * app-template (the bot's repos and `apps`), false for one made from something else, "unknown" when the lookup
 * couldn't say — which fails the plan rather than skipping, since an unreadable lineage isn't proof of anything.
 * undefined means it wasn't checked (the Build job, which only starts after the plan job said yes)
 */
export const planChecks = (repo: RepoSnapshot, { botBuilt }: { botBuilt?: boolean | "unknown" } = {}): CheckPlan => {
  if (botBuilt === "unknown") return { skip: true, failed: true, reason: "couldn't establish the repo's template lineage; the Template step says why" }
  if (botBuilt === false) return { skip: true, reason: "not made from app-template; Build is only for the bot's repos" }
  const ownCi = ownCiOf(repo)
  if (ownCi) return { skip: true, reason: `the repo runs its own CI (${ownCi})` }
  const text = repo.readText("package.json")
  if (!text) return { skip: true, reason: "no package.json at the repo root; nothing for the org CI to run" }
  let packageJson: PackageJson
  try {
    packageJson = JSON.parse(text) as PackageJson
  } catch {
    return { skip: false, reason: "package.json doesn't parse", packageManager: "npm", locked: false, nx: false, nodeVersion: "24", install: "node -e \"JSON.parse(require('fs').readFileSync('package.json','utf8'))\"", postinstall: "", packagesToken: false, checks: [], e2e: false }
  }
  const { packageManager, locked } = packageManagerOf(repo, packageJson)
  const nx = repo.exists("nx.json")
  const checks = nx ? nxChecksOf(packageManager, packageJson.scripts) : checksOf(packageManager, packageJson.scripts)
  const reason = nx
    ? `${packageManager} + nx: install, then nx affected -t ${[...nxTargets, ...(packageJson.scripts?.[coverageScript] ? [coverageScript] : [])].join(", ")}`
    : checks.length ? `${packageManager}: install, then ${checks.map((check) => check.name).join(", ")}` : `${packageManager}: install only (no lint, typecheck, test or build script)`
  return {
    skip: false,
    reason,
    packageManager,
    locked,
    nx,
    ...(packageManager === "pnpm" && !packageJson.packageManager ? { pnpmVersion: defaultPnpmVersion } : {}),
    ...nodeVersionOf(repo, packageJson),
    install: installCommandOf(packageManager, locked, repo.exists(".yarnrc.yml")),
    postinstall: postinstallOf(packageManager, packageJson.scripts),
    packagesToken: packageManager === "pnpm" || packageManager === "npm",
    checks,
    e2e: Boolean(packageJson.scripts?.[e2eScript]),
  }
}

/** a snapshot of the real directory `root` */
export const directorySnapshot = (root: string): RepoSnapshot => ({
  exists: (path) => existsSync(join(root, path)),
  listDirectory: (path) => readdirSync(join(root, path)),
  readText: (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined),
})

/** the plan as step outputs (multiline values use the heredoc form) */
export const outputLinesOf = (plan: CheckPlan) => [
  `skip=${plan.skip}`,
  `reason=${plan.reason}`,
  ...(plan.skip ? [] : [
    `package-manager=${plan.packageManager}`,
    `nx=${plan.nx}`,
    `pnpm-version=${plan.pnpmVersion ?? ""}`,
    `cache=${plan.locked && (plan.packageManager === "pnpm" || plan.packageManager === "npm") ? plan.packageManager : ""}`,
    `node-version=${plan.nodeVersion ?? ""}`,
    `node-version-file=${plan.nodeVersionFile ?? ""}`,
    `install=${plan.install}`,
    `postinstall=${plan.postinstall}`,
    `packages-token=${plan.packagesToken}`,
    `e2e=${plan.e2e}`,
    "checks<<BOT_CI_CHECKS",
    ...plan.checks.map((check) => `${check.name}\t${check.command}`),
    "BOT_CI_CHECKS",
  ]),
]

/**
 * BOT_CI_BUILT, the Template step's verdict (templateLineage.ts): "true", "false", anything else — an empty
 * value from a step that didn't run included — is unknown. unchecked means *no* lineage variable is set at
 * all, so a half-migrated action still setting the old BOT_CI_TEMPLATE pair reads as a check that was
 * attempted and produced nothing, not as permission to build.
 */
export const botBuiltOf = (environment: NodeJS.ProcessEnv): boolean | "unknown" | undefined => {
  const built = environment.BOT_CI_BUILT
  if (built === "true") return true
  if (built === "false") return false
  if (built !== undefined) return "unknown"
  const attempted = environment.BOT_CI_TEMPLATE !== undefined || environment.BOT_CI_TEMPLATE_OF !== undefined
  return attempted ? "unknown" : undefined
}

if (import.meta.main) {
  const plan = planChecks(directorySnapshot(process.cwd()), { botBuilt: botBuiltOf(process.env) })
  const line = `Build: ${plan.skip ? (plan.failed ? "can't plan — " : "skipping — ") : ""}${plan.reason}`
  if (plan.skip && plan.failed) console.error(line)
  else console.log(line)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${outputLinesOf(plan).join("\n")}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Build\n${plan.skip ? (plan.failed ? "Failed" : "Skipped") : "Plan"}: ${plan.reason}\n`)
  if (plan.skip && plan.failed) process.exitCode = 1
}
