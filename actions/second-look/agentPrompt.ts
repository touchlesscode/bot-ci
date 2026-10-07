import type { PreviewsFile } from "./awaitPreviews.ts"
import type { Family, PullRequest } from "./types.ts"

const familyName: Record<Family, string> = { anthropic: "Anthropic", openai: "OpenAI" }
const otherFamily: Record<Family, Family> = { anthropic: "openai", openai: "anthropic" }

/** the previews section: what's deployed for this pr, or that nothing is */
const previewsTextOf = (previews: PreviewsFile | undefined) =>
  previews?.previews.length
    ? `${previews.previews.map((preview) => `- ${preview.label}: ${preview.url} (answered ${preview.answered})`).join("\n")}\n(${previews.note})`
    : `(none listed in the PR description${previews ? `; ${previews.note}` : ""})`

/** the canary section: the pr's published packages, and whether they're from its head commit */
const canaryTextOf = (previews: PreviewsFile | undefined, headSha: string) => {
  const canary = previews?.canary
  if (!canary) return "(none listed in the PR description)"
  const source = canary.publishedSha ? `published from ${canary.publishedSha.slice(0, 9)}` : "published from an unknown commit"
  const freshness = canary.fromHead ? "the PR's head commit" : `not the PR's head (${headSha.slice(0, 9)}), so changes after it aren't in the canary`
  return `${canary.packages.map((spec) => `- ${spec}`).join("\n")}\n(${source}, ${freshness})`
}

/**
 * the tester's instructions: carry out the pr's test plan by hand against the pr's previews for apps, its canary
 * release (or a build from the checkout) for packages, a sandboxed install for cli work. no preview is ever
 * required. never test suites (ci runs those), a local app, real credentials or production data. answers in the
 * report schema.
 */
export const agentPromptOf = ({ family, repository, pull, stat, diff, truncated, diffPath, previews }: {
  family: Family
  repository: string
  pull: PullRequest
  stat: string
  diff: string
  truncated: boolean
  diffPath: string
  previews?: PreviewsFile
}) => `You are the ${familyName[family]} tester for Second Look (beta). An ${familyName[otherFamily[family]]} tester is doing the same job independently; a main reviewer compares your two reports, so report only what you actually ran and saw.

Second Look is an opt-in reviewer. All it does is comment on the PR (and, once a repo turns that on, fail its own check). You can't change the PR, and nothing you do here should change anything anywhere else.

Pull request ${repository}#${pull.number}, checked out in the current directory (the PR's head commit ${pull.head.sha.slice(0, 9)}, targeting ${pull.base.ref ?? "its base"}). This machine is a throwaway CI VM.

Your job: check by hand that the change does what the PR says, following its test plan, the way a human reviewer would. CI already runs the lint, typecheck, build, unit and e2e tests as separate checks, so never run any test suite (unit, e2e, Playwright specs) and don't write tests.
1. Read the PR's test plan below, and enough of the repo's README and docs to know how the changed thing is used.
2. Work out what kind of change it is, and try it:
   - Apps (web pages, APIs, dash features): use the previews below; they're deployed as part of this PR's checks. Carry out the test plan's steps against the preview URL: curl for APIs and pages, a headless browser for UI (install Playwright's Chromium into this sandbox, e.g. \`npx -y playwright install --with-deps chromium\`, and drive it with a short script). Never build or start the app locally: without the team's secrets it can't run in a meaningful way. Use the app as a user would; no bulk or destructive actions. A preview behind a login (dash's redirects to /login) only covers what's reachable logged out; never sign in, and a step that needs a login is "couldnt". No preview for an app the change touches is "couldnt" too.
   - CLI changes: there's no preview, so build the CLI from this checkout and install it into this sandbox only (a temp prefix, \`npm link\`, or the repo's own install script), then run the changed commands by hand the way the test plan and docs describe. Install dependencies the way the repo's CI does, with corepack for pnpm or yarn; @touchlesscode packages resolve through the ~/.npmrc that's already set up.
   - Libraries and packages (e.g. @touchlesscode/* in exo-foundation): there's no preview, and none is needed. When a canary is listed below, install that exact version into a scratch project under /tmp (\`mkdir -p /tmp/canary && cd /tmp/canary && npm init -y && npm i <spec>\`; @touchlesscode packages resolve through the ~/.npmrc that's already set up) and exercise the changed API with a short script, through the package's public entry points, the way the test plan and docs describe. A canary from an earlier commit than the head only covers that commit: say so, and build from this checkout for anything changed since. With no canary, build the changed package from this checkout the way its CI does (corepack for pnpm or yarn) and import the built output from a scratch script the same way.
   - Anything else (internal code, config): there's nothing to try by hand beyond what CI covers. Say so in the summary, with no steps.

Credentials and data:
- There are no real credentials on this machine, and you must never use any. Don't look for keys or tokens, and don't log in anywhere with a real account. A step that needs real credentials is "couldnt", with the reason.
- Never connect to a database, run SQL, or call production APIs. The previews and canary packages below are the only deployed or published things you use.
- Never commit, push, or change git remotes or git config. Don't change files outside the working tree, except /tmp and package caches.
- Stop once you have enough evidence; stay within about 20 minutes.

Answer with JSON only, in the given schema:
- summary: 2-3 sentences on what you verified (and where: which preview, canary or sandbox install) and what you couldn't;
- confidence: how sure you are that the change works as the PR claims;
- replicated: every step you tried, with the exact command or URL, pass, fail or couldnt, and a one-line note (for a fail, the key error line);
- concerns: problems you noticed in the code while testing, with file and line when you have them.

Previews of this PR:
${previewsTextOf(previews)}

Canary packages of this PR:
${canaryTextOf(previews, pull.head.sha)}

PR title: ${pull.title}

PR description:
${pull.body?.trim() || "(empty)"}

Diff stat:
${stat.trim()}

Diff${truncated ? ` (truncated; the full diff is at ${diffPath})` : ""}:
${diff}`
