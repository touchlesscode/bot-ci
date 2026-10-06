#!/usr/bin/env node
/**
 * arch governor — a read-only architecture review of a pull request by a model
 * from a different family than the harness that wrote it. runs as a required
 * github check: posts one review comment (never an approval). advisory by
 * default: the check always passes and a "block" verdict or a governor error
 * is a warning. with ARCH_GOVERNOR_MODE=enforce it exits 1 on either.
 *
 *   node .github/arch-governor/review.ts   (inside the workflow; env below)
 *
 * env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, ANTHROPIC_API_KEY and/or OPENAI_API_KEY,
 * optional ARCH_GOVERNOR_ANTHROPIC_MODEL, ARCH_GOVERNOR_OPENAI_MODEL, ARCH_GOVERNOR_RULES (the repo's
 * rules file, default .github/arch-governor/rules.md), ARCH_GOVERNOR_DEFAULT_RULES (used when the repo
 * has none), ARCH_GOVERNOR_SCOPE (`bot`, the default, or `all`), ARCH_GOVERNOR_BOT_LOGINS (comma list),
 * ARCH_GOVERNOR_MODE (`advisory`, the default, or `enforce`).
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

type Finding = { file?: string; line?: number; severity: "block" | "warn"; note: string }
type Verdict = { verdict: "pass" | "block"; summary: string; findings: Finding[] }
type Family = "anthropic" | "openai"
type PullRequest = { number: number; body?: string | null; base: { sha: string }; head: { sha: string }; title: string; user?: { login?: string } }

const maxDiffChars = 180_000
const defaultBotLogins = ["touchless-bot[bot]"]

/** the harness that wrote the pr, from the `<!-- harness: claude -->` marker the bot puts in the body */
const harnessOf = (body: string | null | undefined) => /<!--\s*harness:\s*(claude|codex)\s*-->/i.exec(body ?? "")?.[1]?.toLowerCase()

/**
 * whether this pr gets reviewed: every pr with scope `all`, otherwise only prs the bot opened
 * or that carry its harness marker. out-of-scope prs pass (exit 0) rather than skip, because a
 * ruleset-required workflow has to conclude successfully.
 */
export const isInScope = ({ scope, author, body, botLogins = defaultBotLogins }: { scope?: string; author?: string; body?: string | null; botLogins?: string[] }) =>
  scope === "all" || (author !== undefined && botLogins.includes(author)) || harnessOf(body) !== undefined

/** the repo's own rules file first, then the org default, then general judgement */
export const rulesOf = (paths: (string | undefined)[], read: (path: string) => string | undefined = (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined)) =>
  paths.reduce<string | undefined>((found, path) => found ?? (path ? read(path) : undefined), undefined) ?? "No repo-specific rules; apply general architecture judgement."

/** the other family when the harness is known; anthropic otherwise, openai when that's the only key */
export const reviewerFamilyOf = (harness: string | undefined, keys: { anthropic: boolean; openai: boolean }): Family => {
  const wanted: Family = harness === "claude" ? "openai" : "anthropic"
  if (wanted === "openai" && !keys.openai) return "anthropic"
  if (wanted === "anthropic" && !keys.anthropic) return "openai"
  return wanted
}

const instructions = (rules: string) => `You are the Arch Governor, a read-only architecture reviewer for pull requests written by an AI coding harness.
Judge the diff against the architecture rules below. Block only for rule violations, unsafe data or auth handling, or changes that clearly contradict the stated design; style nits are "warn" or omitted.
Answer with JSON only: {"verdict":"pass"|"block","summary":"<2-3 sentences>","findings":[{"file":"<path>","line":<number>,"severity":"block"|"warn","note":"<one sentence>"}]}

Architecture rules:
${rules}`

type ModelPayload = { content?: { type?: string; text?: string }[]; stop_reason?: string; choices?: { message?: { content?: string } }[] }

/**
 * the verdict json out of a model reply. anthropic replies can lead with
 * thinking blocks, so every text block counts, not just the first; a reply
 * with none says why (stop reason, block types) instead of failing blind.
 */
export const verdictJsonOf = (family: Family, payload: ModelPayload) => {
  const text = family === "anthropic"
    ? (payload.content ?? []).filter((block) => (block.type ?? "text") === "text").map((block) => block.text ?? "").join("\n")
    : payload.choices?.[0]?.message?.content ?? ""
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (json) return json
  const detail = family === "anthropic" ? ` (stop_reason ${payload.stop_reason ?? "none"}, blocks ${(payload.content ?? []).map((block) => block.type ?? "?").join(",") || "none"})` : ""
  throw new Error(`${family} returned no json verdict${detail}`)
}

/** one json verdict from the chosen model */
const askModel = async (family: Family, system: string, user: string): Promise<Verdict> => {
  const response = family === "anthropic"
    ? await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.ARCH_GOVERNOR_ANTHROPIC_MODEL || "claude-opus-5-5", max_tokens: 16000, system, messages: [{ role: "user", content: user }] }),
      })
    : await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
        body: JSON.stringify({ model: process.env.ARCH_GOVERNOR_OPENAI_MODEL || "gpt-6-sol", response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      })
  if (!response.ok) throw new Error(`${family} answered ${response.status}: ${(await response.text()).slice(0, 400)}`)
  return JSON.parse(verdictJsonOf(family, (await response.json()) as ModelPayload)) as Verdict
}

/** `enforce` fails the check on a block verdict or a governor error; anything else (the default while it's being tested) only advises */
export const isEnforcing = (mode: string | undefined) => mode?.trim().toLowerCase() === "enforce"

/** the review comment body */
export const reviewBodyOf = (verdict: Verdict, family: Family, harness: string | undefined, enforcing = false) => [
  `**Arch Governor: ${verdict.verdict === "block" ? (enforcing ? "blocked" : "would block") : "passed"}** (${family} reviewing ${harness ?? "unlabelled"} work)${enforcing ? "" : " · advisory, doesn't fail the check"}`,
  "",
  verdict.summary,
  ...(verdict.findings.length ? ["", ...verdict.findings.map((finding) => `- ${finding.severity === "block" ? "**block**" : "warn"} ${finding.file ? `\`${finding.file}${finding.line ? `:${finding.line}` : ""}\` ` : ""}${finding.note}`)] : []),
].join("\n")

/** workflow entry */
const main = async () => {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request: PullRequest }
  const pull = event.pull_request
  const botLogins = process.env.ARCH_GOVERNOR_BOT_LOGINS?.split(",").map((login) => login.trim()).filter(Boolean)
  if (!isInScope({ scope: process.env.ARCH_GOVERNOR_SCOPE, author: pull.user?.login, body: pull.body, botLogins: botLogins?.length ? botLogins : undefined })) {
    console.log(`not a bot pull request (author ${pull.user?.login ?? "unknown"}); the arch governor only reviews bot work unless ARCH_GOVERNOR_SCOPE=all`)
    return
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) throw new Error("no model key: set the ARCH_GOVERNOR_ANTHROPIC_API_KEY and/or ARCH_GOVERNOR_OPENAI_API_KEY org secret")
  const rules = rulesOf([process.env.ARCH_GOVERNOR_RULES || ".github/arch-governor/rules.md", process.env.ARCH_GOVERNOR_DEFAULT_RULES])
  const diff = execFileSync("git", ["diff", "--no-color", `${pull.base.sha}...${pull.head.sha}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const harness = harnessOf(pull.body)
  const family = reviewerFamilyOf(harness, { anthropic: Boolean(process.env.ANTHROPIC_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY) })
  const truncated = diff.length > maxDiffChars
  const verdict = await askModel(family, instructions(rules), `PR: ${pull.title}\n\n${pull.body ?? ""}\n\nDiff${truncated ? " (truncated)" : ""}:\n${diff.slice(0, maxDiffChars)}`)
  const enforcing = isEnforcing(process.env.ARCH_GOVERNOR_MODE)
  const body = reviewBodyOf(verdict, family, harness, enforcing)
  const review = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/pulls/${pull.number}/reviews`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify({ event: "COMMENT", commit_id: pull.head.sha, body }),
  })
  if (!review.ok) console.error(`couldn't post the review: ${review.status}`)
  console.log(body)
  if (verdict.verdict !== "block") return
  if (enforcing) process.exit(1)
  console.log("::warning title=Arch Governor (advisory)::would block this PR; see the review comment. Set the org variable ARCH_GOVERNOR_MODE=enforce to fail the check.")
}

if (import.meta.main) main().catch((error: Error) => {
  if (isEnforcing(process.env.ARCH_GOVERNOR_MODE)) {
    console.error(`arch governor failed: ${error.message}`)
    process.exit(1)
  }
  console.log(`::warning title=Arch Governor (advisory)::couldn't review, not failing the check: ${error.message}`)
})
