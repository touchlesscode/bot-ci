/**
 * what keeps a pull request's "preview" from landing on anything else. the deploy job
 * runs these on the PR's filled-in wrangler config (data only, never executed) before
 * it deploys: the worker has to be `<app>-<version>`, every route it would take has to be
 * `<app>-<version>.<zone>`, and infra secrets are never pushed into a preview.
 */

export type Route = string | { pattern: string; custom_domain?: boolean; zone_name?: string; zone_id?: string }

export type WorkerEnv = {
  name?: string
  main?: string
  routes?: Route[]
  route?: Route
  assets?: { directory?: string; [key: string]: unknown }
  [key: string]: unknown
}

export type WranglerConfig = WorkerEnv & { env?: Record<string, WorkerEnv | undefined> }

export type BundleLayout = { mainFile: string; hasAssets: boolean }

/** secrets that run the org's infra; a preview never gets them, whatever config.exo.secrets lists */
export const infraSecretPattern = /^(CLOUDFLARE_|SECOND_LOOK_|ARCH_GOVERNOR_|GITHUB_|ACTIONS_|RUNNER_|BOT_CI_|ORG_CI_|NPM_|NODE_AUTH_)/

/** keys that make wrangler run or bundle code locally, or point it at files the deploy job doesn't have */
const localBuildKeys = ["build", "main", "no_bundle", "find_additional_modules", "base_dir", "rules", "alias", "define", "tsconfig", "minify", "$schema"]

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** the routes `wrangler deploy --env feature` would take: the env's own, else the inherited top-level ones */
export const effectiveRoutesOf = (config: WranglerConfig): Route[] => {
  const feature = config.env?.feature ?? {}
  const own = feature.routes ?? (feature.route ? [feature.route] : undefined)
  return own ?? config.routes ?? (config.route ? [config.route] : [])
}

/** the host a route pattern serves, scheme and path dropped */
export const hostOf = (route: Route) => (typeof route === "string" ? route : route.pattern).replace(/^[a-z]+:\/\//i, "").split("/")[0]?.toLowerCase() ?? ""

/** why this config isn't safe to deploy as a preview of `version` on `zone`; empty when it is */
export const previewProblemsOf = ({ config, version, zone }: { config: WranglerConfig; version: string; zone: string }) => {
  const feature = config.env?.feature
  if (!feature) return ["there's no env.feature section"]
  if (!/^[a-z0-9-]+-pr$/.test(version)) return [`"${version}" isn't a pull request version (<branch>-pr)`]
  const label = `[a-z0-9]([a-z0-9-]*[a-z0-9])?-${escapeRegExp(version)}`
  const problems: string[] = []
  const name = feature.name ?? ""
  if (!new RegExp(`^${label}$`).test(name) || name.length > 63) problems.push(`env.feature.name must be <app>-${version}, not "${name || "(unset)"}"`)
  const prodNames = Object.entries(config.env ?? {}).filter(([key]) => key !== "feature").map(([, env]) => env?.name).filter(Boolean)
  if (prodNames.includes(name)) problems.push(`env.feature.name "${name}" is another env's worker`)
  const previewHost = new RegExp(`^${label}\\.${escapeRegExp(zone.toLowerCase())}$`)
  for (const route of effectiveRoutesOf(config)) {
    const host = hostOf(route)
    if (typeof route !== "string" && route.custom_domain) problems.push(`route "${host}" is a custom domain; previews only take routes`)
    else if (!previewHost.test(host)) problems.push(`route "${host || "(empty)"}" isn't <app>-${version}.${zone}${feature.routes || feature.route ? "" : " (inherited from the top level; give env.feature its own routes)"}`)
    if (typeof route !== "string" && route.zone_name && route.zone_name.toLowerCase() !== zone.toLowerCase()) problems.push(`route "${host}" names zone ${route.zone_name}, not ${zone}`)
  }
  return problems
}

/** config.exo.secrets names that are infra secrets */
export const infraSecretsIn = (names: string[]) => names.filter((name) => infraSecretPattern.test(name))

/** the assets block `wrangler deploy --env feature` would use */
export const effectiveAssetsOf = (config: WranglerConfig) => config.env?.feature?.assets ?? config.assets

const withoutKeys = (env: WorkerEnv, keys: string[]) => Object.fromEntries(Object.entries(env).filter(([key]) => !keys.includes(key))) as WorkerEnv

/**
 * the config the deploy job hands wrangler: only env.feature, the prebuilt bundle as
 * `bundle/<mainFile>` with no bundling and no build command, assets (if any) from `assets/`.
 */
export const deployConfigOf = (config: WranglerConfig, layout: BundleLayout): WranglerConfig => {
  const assets = effectiveAssetsOf(config)
  const { env: _env, assets: _assets, ...topLevel } = config
  const { assets: _featureAssets, ...feature } = config.env?.feature ?? {}
  return {
    ...withoutKeys(topLevel, localBuildKeys),
    main: `bundle/${layout.mainFile}`,
    no_bundle: true,
    find_additional_modules: true,
    base_dir: "bundle",
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }, { type: "CompiledWasm", globs: ["**/*.wasm"] }, { type: "Text", globs: ["**/*.txt", "**/*.html"] }, { type: "Data", globs: ["**/*.bin"] }],
    env: { feature: { ...withoutKeys(feature, localBuildKeys), ...(layout.hasAssets && assets ? { assets: { ...assets, directory: "assets" } } : {}) } },
  }
}
