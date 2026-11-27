import { conversationNoiseOf } from "./conversationNoiseOf.ts"
import { conversationTextOf } from "./conversationTextOf.ts"
import { findingOutcomeOf } from "./findingOutcomeOf.ts"
import { findingMarker } from "./inlineCommentsOf.ts"
import { summaryAnswerKeyOf, summaryAnswersOf } from "./summaryAnswerOf.ts"
import type { ConversationThread, EarlierThread, FindingOutcome, LedgerEntry, PullConversation } from "./types.ts"

/** how many items each section keeps (newest first) and how long each one may run */
export const digestLimits = { ownFindings: 30, summaryFindings: 15, otherThreads: 20, reviews: 10, comments: 15, itemChars: 300, commentChars: 500, totalChars: 14_000 }

const dayOf = (iso: string) => iso.slice(0, 10)
const newestFirst = <T>(items: T[], dateOf: (item: T) => string) => [...items].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
const whereOf = (thread: ConversationThread) => `\`${thread.path}:${thread.line ?? thread.originalLine ?? "?"}\``
const quoted = (words: string) => `"${conversationTextOf(words, digestLimits.itemChars)}"`
const resolvedByOf = (login: string | null) => (login ? `; resolved by @${login}` : "; resolved")

/** a finding's severity and its words, without second look's marker, old header, label and footnote */
const gistOf = (body: string) => {
  const severity = /\*\*Warning:\*\*/.test(body) ? "warning" : /\*\*Nit:\*\*/.test(body) ? "nit" : "finding"
  const text = body.replace(findingMarker, "").replace(/^\s*\*\*Second Look(?: \(beta\))?\*\*[^\n]*\n+/, "").replace(/\*\*(Warning|Nit):\*\*/, "")
  return { severity, gist: conversationTextOf(text, digestLimits.itemChars) }
}

/** the outcome as the digest says it; `key` is the thread's prompt key when the reviewer can follow it up */
const outcomeTextOf = (outcome: FindingOutcome, key: string | undefined) => {
  const followUp = key ? ` (thread ${key})` : "repliedAfter" in outcome && outcome.repliedAfter ? "; you already replied to that, so it's settled" : ""
  switch (outcome.kind) {
    case "open": return `STILL OPEN${followUp}: follow it up there, never as a new finding`
    case "fixed": return `FIXED in ${outcome.sha}`
    case "fixedPerAuthor": return `FIXED, says @${outcome.by}: ${quoted(outcome.words)}${resolvedByOf(outcome.resolvedBy)}${followUp}`
    case "declined": return `DECLINED by @${outcome.by}: ${quoted(outcome.words)}${resolvedByOf(outcome.resolvedBy)}${followUp}`
    case "answered": return `ANSWERED by @${outcome.by}: ${quoted(outcome.words)}${resolvedByOf(outcome.resolvedBy)}${followUp}`
    case "superseded": return `SUPERSEDED: the code there changed${resolvedByOf(outcome.resolvedBy)} without a reply`
    case "resolved": return `RESOLVED${outcome.resolvedBy ? ` by @${outcome.resolvedBy}` : ""} without a reply`
  }
}

/** a thread someone else started: who, where, its state, the gist and the latest replies */
const otherThreadLineOf = (thread: ConversationThread) => {
  const [first, ...replies] = thread.comments
  const state = thread.resolved ? `resolved${thread.resolvedBy ? ` by @${thread.resolvedBy}` : ""}` : thread.outdated ? "open, outdated" : "open"
  const answers = replies.slice(-2).map((reply) => ` reply @${reply.author}: ${quoted(reply.body)}`).join(";")
  return `- @${first.author} on ${whereOf(thread)} (${state}): ${conversationTextOf(first.body, digestLimits.itemChars)}${answers ? `;${answers}` : ""}`
}

/** a titled list, or nothing when it's empty */
const sectionOf = (title: string, lines: string[]) => (lines.length ? [`### ${title}`, ...lines, ""] : [])

/**
 * the pr's conversation so far, for the main reviewer, newest first in each part: every finding second look
 * made inline (one of `ownLogins` started the thread, and is the author its replies are judged by) with what became of it, the summary-only ones from its `ledger`,
 * other reviewers' inline threads, other reviews' bodies, and the general conversation. bot reports, second
 * look's own comments (`ownLogins`) and commands are dropped, each item is capped and the whole digest too.
 * `earlier` gives the prompt key of every thread the reviewer can follow up.
 */
export const conversationDigestOf = ({ conversation, ownLogins, earlier, ledger }: {
  conversation: PullConversation
  ownLogins: readonly string[]
  earlier: EarlierThread[]
  ledger: LedgerEntry[]
}) => {
  const keyOf = new Map(earlier.map((thread) => [thread.id, thread.key]))
  const started = conversation.threads.filter((thread) => thread.comments.length > 0)
  const ours = started.filter((thread) => ownLogins.includes(thread.comments[0].author) && thread.comments[0].body.includes(findingMarker))
  // other reviewers' inline threads are all kept, review bots' (Bugbot, Copilot, CodeRabbit) included
  const others = started.filter((thread) => !ownLogins.includes(thread.comments[0].author) && thread.comments[0].body.trim())
  const own = newestFirst(ours, (thread) => thread.comments[0].createdAt).slice(0, digestLimits.ownFindings).map((thread) => {
    const { severity, gist } = gistOf(thread.comments[0].body)
    return `- ${whereOf(thread)} ${severity}, raised ${dayOf(thread.comments[0].createdAt)}: ${gist} → ${outcomeTextOf(findingOutcomeOf(thread, thread.comments[0].author), keyOf.get(thread.id))}`
  })
  // the PR's build answers a summary-only finding in a comment of its own (summaryAnswerBodyOf), a bot's, which the
  // conversation below leaves out as noise: its answer goes on the finding's own line
  const answers = summaryAnswersOf(conversation.comments)
  const summaryOnly = ledger.slice(0, digestLimits.summaryFindings).map((entry) => {
    const answer = answers.get(summaryAnswerKeyOf(entry))
    const outcome = answer ? `ANSWERED by @${answer.by}: ${quoted(answer.words)}` : "no thread; any answer is in the conversation below"
    return `- ${entry.file ? `\`${entry.file}\` ` : ""}${entry.severity}, summary only at ${entry.sha}: ${conversationTextOf(entry.note, digestLimits.itemChars)} → ${outcome}`
  })
  const otherThreads = newestFirst(others, (thread) => thread.comments[0].createdAt).slice(0, digestLimits.otherThreads).map(otherThreadLineOf)
  const reviews = newestFirst(conversation.reviews.filter((review) => !conversationNoiseOf(review, ownLogins)), (review) => review.submittedAt)
    .slice(0, digestLimits.reviews)
    .map((review) => `- @${review.author} ${review.state.toLowerCase().replace(/_/g, " ")}${review.commit ? ` at ${review.commit.slice(0, 7)}` : ""} (${dayOf(review.submittedAt)}): ${conversationTextOf(review.body, digestLimits.itemChars)}`)
  const comments = newestFirst(conversation.comments.filter((comment) => !conversationNoiseOf(comment, ownLogins)), (comment) => comment.createdAt)
    .slice(0, digestLimits.comments)
    .map((comment) => `- @${comment.author} (${dayOf(comment.createdAt)}): ${conversationTextOf(comment.body, digestLimits.commentChars)}`)
  const lines = [
    ...sectionOf("Second Look's earlier inline findings and what became of them", own),
    ...sectionOf("Second Look's earlier summary-only findings (no inline thread)", summaryOnly),
    ...sectionOf("Other reviewers' inline comments", otherThreads),
    ...sectionOf("Other reviews", reviews),
    ...sectionOf("PR conversation (people's comments)", comments),
  ]
  if (!lines.length) return "(none: nothing has been said on this PR yet)"
  const text = lines.join("\n").trim()
  if (text.length <= digestLimits.totalChars) return text
  const cut = text.slice(0, digestLimits.totalChars)
  return `${cut.slice(0, cut.lastIndexOf("\n"))}\n(older items cut to fit)`
}
