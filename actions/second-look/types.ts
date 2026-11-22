import type { RiskTier } from "./riskTiers.ts"

/** the two model families second look runs: one tester each, and the main reviewer is one of them */
export type Family = "anthropic" | "openai"

/** the coding harness that wrote a bot pr, from its `<!-- harness: … -->` marker */
export type Harness = "claude" | "codex"

/** the slice of the github pull_request payload second look reads */
export type PullRequest = {
  number: number
  title: string
  body?: string | null
  draft?: boolean
  state?: string
  base: { sha: string; ref?: string; repo?: { full_name?: string } }
  head: { sha: string; ref?: string; repo?: { full_name?: string } }
  user?: { login?: string }
  additions?: number
  deletions?: number
}

/** one testing step a tester tried */
export type ReplicatedStep = { step: string; command: string; result: "pass" | "fail" | "couldnt"; note: string }

/** something a tester noticed in the code while testing */
export type Concern = { file: string | null; line: number | null; note: string }

/** what a tester agent reports back to the main reviewer */
export type AgentReport = {
  family: Family
  model: string
  status: "ran" | "crashed" | "skipped"
  summary: string
  confidence: "high" | "medium" | "low"
  replicated: ReplicatedStep[]
  concerns: Concern[]
  costUsd?: number
  /** codex's "tokens used" total, when it printed one */
  tokensUsed?: number
  /** the harness's line on dash: signed in, as whom, or why not (dashAccessOf.ts); absent when no dash preview is involved */
  access?: string
  /** the provider refused on credit, quota or credentials (providerErrorOf.ts): the tester never tested */
  providerError?: ProviderError
}

/** a provider's refusal on money or credentials, as opposed to a crash or a bad answer */
export type ProviderError = { provider: string; family: Family; kind: "billing" | "auth"; message: string }

/**
 * what a run does before any model starts (reviewPlanOf.ts), decided in fetchPull.ts and carried in the event file so
 * the testers, awaitPreviews.ts and the reviewer all follow it
 * - `skip`: no model review at all, and why (a test sandbox repo, a docs-only pr)
 * - `review`: the whole pr, or only what changed `since` the last reviewed head (`sinceTier` its tier then)
 * - `testers`: run them, or skip them with `testersReason`
 * - `anthropicModel`: the smaller model to use instead of the configured one, with `modelReason` either way
 */
export type ReviewPlan = {
  skip?: string
  review: "full" | "incremental"
  since?: string
  sinceTier?: number
  fullReason?: string
  testers: "run" | "skip"
  testersReason?: string
  anthropicModel?: string
  modelReason: string
  changedLines?: number
}

/** warning: should change before merge (a block rests on these); nit: small, optional polish */
export type Severity = "warning" | "nit"

/** one finding in the main reviewer's verdict; `source` is the doc, rule or tester it rests on */
export type Finding = { file: string | null; line: number | null; severity: Severity; note: string; source: string }

/** fixed: the head no longer has the issue; open: still there, nothing new to say; update: still there, with something new */
export type ThreadStatus = "fixed" | "open" | "update"

/** the reviewer's call on one earlier thread, by its prompt key (`T1`…); `note` is the reply, blank for open */
export type ThreadFollowUp = { thread: string; status: ThreadStatus; note: string }

/** an unresolved inline thread an earlier second look run started on the pr */
export type EarlierThread = {
  key: string
  id: string
  commentId: number
  url: string
  path: string
  line: number | null
  originalLine: number | null
  outdated: boolean
  finding: string
  replies: { author: string; body: string }[]
  /** who resolved it, for a resolved thread a person answered (answeredThreadsOf.ts): the reviewer may reply once, never reopen it */
  resolvedBy?: string
}

/** one comment in a pr's conversation, as the conversation fetch reads it */
export type ConversationComment = { author: string; body: string; createdAt: string; databaseId?: number; url?: string }

/** one inline review thread on a pr, resolved or not, by anyone */
export type ConversationThread = {
  id: string
  resolved: boolean
  resolvedBy: string | null
  outdated: boolean
  path: string
  line: number | null
  originalLine: number | null
  comments: ConversationComment[]
}

/** one submitted review: its state, body and the commit it was on */
export type ConversationReview = { author: string; state: string; body: string; submittedAt: string; commit: string }

/** everything said on a pr so far: inline threads, reviews, and the general conversation (issue comments) */
export type PullConversation = { threads: ConversationThread[]; reviews: ConversationReview[]; comments: ConversationComment[] }

/** a finding second look gave only in its summary comment (no line on the diff), kept across runs in that comment */
export type LedgerEntry = { sha: string; severity: Severity; file: string | null; note: string }

/** what became of one of second look's earlier inline findings */
export type FindingOutcome =
  | { kind: "open" }
  | { kind: "fixed"; sha: string }
  | { kind: "fixedPerAuthor" | "declined" | "answered"; by: string; words: string; resolvedBy: string | null; repliedAfter: boolean }
  | { kind: "resolved" | "superseded"; resolvedBy: string | null }

/** the main reviewer's answer; `tier` is the pr's risk tier by riskTiers.ts's rubric, `tierReason` why */
export type Verdict = {
  verdict: "pass" | "block"
  summary: string
  /** false when the reviewer couldn't read the checkout and judged from the diff and its inputs alone */
  readRepo?: boolean
  tier: RiskTier
  tierReason: string
  intent: string[]
  intendedArchitecture: string[]
  tested: string[]
  disagreements: string[]
  findings: Finding[]
  earlier: ThreadFollowUp[]
}

/** read-only view of a checked-out repo, injectable for tests */
export type RepoSnapshot = {
  exists: (path: string) => boolean
  isDirectory: (path: string) => boolean
  listDirectory: (path: string) => string[]
}

/**
 * a line second look already answered a person on (their answer, then its one reply, in a resolved thread): a new
 * finding there is a repeat, dropped, unless the code around the line `changed` since that reply
 */
export type SettledSpot = { path: string; line: number; changed: boolean; url: string }
