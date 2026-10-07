#!/usr/bin/env node
/**
 * pr title + description lint — the same rules as exo's `exo cicd pr-linting`
 * (apps/exo-cli/src/cicd/utils/runPrLinting.ts), without its dependencies:
 *   title  `type(scope): description | EXO-1234` (or `| NO-TICKET`)
 *   body   `## Summary`, `### Jira Ticket Reference` (a valid EXO key/link, N/A or NO-TICKET), `### Test Plan`
 *
 *   node lintPullRequest.ts   (in the action; reads $GITHUB_EVENT_PATH)
 *
 * env: PR_LINT_SCOPE (`bot`, the default: only bot-authored PRs; `all`: every PR),
 * PR_LINT_BOT_LOGINS (comma-separated, default touchless-bot[bot]).
 */
import { appendFileSync, readFileSync } from "node:fs"

export type PullRequestText = { title: string; body: string; branch: string }

export type LintResult = { skipped?: string; errors: { title: string; message: string }[] }

type Section = { heading: string; placeholder: string; message: string; annotation: string }

const semanticTitle = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf)(\([^)]+\))?: .+/
const ticketSuffix = /\| (EXO-\d+|NO-TICKET)$/
const jiraReference = /^(EXO-\d+|\[EXO-\d+\]\(https?:\/\/[^/\s]+\/browse\/EXO-\d+\)|https?:\/\/[^/\s]+\/browse\/EXO-\d+|N\/A|NO-TICKET)$/i
const harnessMarker = /<!--\s*harness:\s*(claude|codex)\s*-->/i
const defaultBotLogins = ["touchless-bot[bot]", "clanker-in-chief"]

const sections: Section[] = [
  {
    heading: "## Summary",
    placeholder: "_Include a summary of the change; which issue is fixed or feature added. Please also include relevant motivation and context. List any dependencies that are required for this change. Requires a minimum of 1 line._",
    message: "The **Summary** section is incomplete. Please provide a summary of your changes.",
    annotation: "Summary Section Incomplete",
  },
  {
    heading: "### Jira Ticket Reference",
    placeholder: "_Please link to the related Jira ticket._",
    message: "The **Jira Ticket Reference** section is incomplete. Please provide a link to the Jira ticket. If there is no ticket, use \"N/A\" or \"NO-TICKET\".",
    annotation: "Jira Ticket Reference Missing",
  },
  {
    heading: "### Test Plan",
    placeholder: "_Please describe the tests that you ran to verify your changes. Provide instructions so we can reproduce. This test plan can be oriented towards developers. Please also list any relevant details for your test configuration_",
    message: "The **Test Plan** section is incomplete. Please provide testing instructions.",
    annotation: "Test Plan Section Incomplete",
  },
]

/** whether the lint applies: everything with scope `all`, otherwise only PRs the bot opened or drove */
export const isLintInScope = ({ scope, author, body, botLogins = defaultBotLogins }: { scope?: string; author?: string; body?: string; botLogins?: string[] }) =>
  scope === "all" || (author !== undefined && botLogins.includes(author)) || harnessMarker.test(body ?? "")

/** the content under a markdown heading, up to the next `##`/`###` heading (html comments after the heading are ignored) */
export const sectionContentOf = (body: string, heading: string) =>
  body.match(new RegExp(`${heading}\\s*(?:<!--.*?-->\\s*)*([\\s\\S]*?)(?=^## |^### |\\s*$)`, "m"))?.[1]?.trim()

/** every title and description problem, or why the pr is exempt (dependabot, merge queue, reverts) */
export const lintPullRequest = ({ title, body, branch }: PullRequestText): LintResult => {
  if (branch.startsWith("dependabot/")) return { skipped: "dependabot branch", errors: [] }
  if (branch.startsWith("gh-readonly-queue/")) return { skipped: "merge queue", errors: [] }
  if (branch.startsWith("revert") && body.includes("Reverts") && body.includes("#")) return { skipped: "revert", errors: [] }

  const titleErrors = [
    semanticTitle.test(title) ? undefined : { title: "PR Title Validation Error", message: "**PR Title Error**: PR title does not follow the semantic messaging format (e.g., \"feat: add new feature\")." },
    ticketSuffix.test(title) ? undefined : { title: "PR Title Validation Error", message: "**PR Title Error**: PR title must end with \"| EXO-XXXX\", where \"XXXX\" is the ticket number. Example: \"feat: add new feature | EXO-1234\". If there is no ticket, use \"NO-TICKET\"." },
  ].filter((error) => error !== undefined)
  if (titleErrors.length) return { errors: titleErrors }

  const descriptionErrors = sections.flatMap((section) => {
    const content = sectionContentOf(body, section.heading)
    const name = section.heading.replace(/#+\s*/, "")
    if (content === undefined) return [{ title: section.annotation, message: `**Missing Section**: The **${name}** section is missing. Please include it in your PR description.` }]
    if (!content || content === section.placeholder) return [{ title: section.annotation, message: section.message }]
    if (section.heading === "### Jira Ticket Reference" && !jiraReference.test(content)) {
      return [{ title: "Jira Ticket Reference Invalid or Missing", message: "Please provide a valid Jira ticket reference in the **Jira Ticket Reference** section. Accepted formats are \"exo-1234\", \"EXO-1234\", \"https://touchless.atlassian.net/browse/EXO-1234\", \"[EXO-1234](https://touchless.atlassian.net/browse/EXO-1234)\", \"N/A\", or \"NO-TICKET\"." }]
    }
    return []
  })
  return { errors: descriptionErrors }
}

type PullRequestEvent = { pull_request?: { title?: string; body?: string | null; head?: { ref?: string }; user?: { login?: string } } }

if (import.meta.main) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as PullRequestEvent
  const pull = event.pull_request
  if (!pull) {
    console.log("pr-lint: not a pull request event; nothing to lint")
    process.exit(0)
  }
  const body = pull.body ?? ""
  const botLogins = process.env.PR_LINT_BOT_LOGINS ? process.env.PR_LINT_BOT_LOGINS.split(",").map((login) => login.trim()) : undefined
  if (!isLintInScope({ scope: process.env.PR_LINT_SCOPE, author: pull.user?.login, body, botLogins })) {
    console.log(`pr-lint: not a bot pull request (author ${pull.user?.login}); set the org variable PR_LINT_SCOPE=all to lint every PR`)
    process.exit(0)
  }
  const result = lintPullRequest({ title: pull.title ?? "", body, branch: pull.head?.ref ?? "" })
  if (result.skipped) {
    console.log(`pr-lint: skipped (${result.skipped})`)
    process.exit(0)
  }
  for (const error of result.errors) console.log(`::error title=${error.title}::${error.message}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = result.errors.length ? `### PR lint failed\n${result.errors.map((error) => `- ${error.message}`).join("\n")}\n\nEditing the title or description doesn't re-run this check (org rulesets ignore the \`edited\` event): push a commit, or close and reopen the PR.\n` : "### PR lint passed\n"
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  }
  if (result.errors.length) process.exit(1)
  console.log("pr-lint: title and description meet the requirements")
}
