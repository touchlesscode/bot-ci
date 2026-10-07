/** a canary build of the pr's packages: what to install, and which commit it was published from */
export type CanaryRelease = { packages: string[]; publishedSha?: string }

const blockStart = "<!-- canary-release:start -->"
const blockEnd = "<!-- canary-release:end -->"
const publishedShaPattern = /<!-- canary-release:published-sha:([0-9a-f]{7,40}) -->/
const installPattern = /^\s*(?:pnpm add|npm (?:i|install)|yarn add)\s+(.+)$/gm
const exactVersionPattern = /@\d+\.\d+\.\d+[^@\s]*$/

/**
 * the canary release in a pr description's canary-release block, which foundation's PR Canary Section
 * writes once a canary is published: the install specs (exact pins when it lists them, else its dist
 * tags) and the commit it came from. undefined when there's no block or nothing to install.
 */
export const canaryReleaseOf = (body: string | null | undefined): CanaryRelease | undefined => {
  const text = body ?? ""
  const from = text.indexOf(blockStart)
  const to = from === -1 ? -1 : text.indexOf(blockEnd, from)
  if (to === -1) return undefined
  const block = text.slice(from, to)
  const specs = [...block.matchAll(installPattern)].flatMap((match) => match[1]!.split(/\s+/).filter((token) => token.length > 1 && !token.startsWith("-") && token.lastIndexOf("@") > 0))
  const exact = specs.filter((spec) => exactVersionPattern.test(spec))
  const packages = [...new Set(exact.length ? exact : specs)]
  if (!packages.length) return undefined
  const publishedSha = publishedShaPattern.exec(block)?.[1]
  return { packages, ...(publishedSha ? { publishedSha } : {}) }
}
