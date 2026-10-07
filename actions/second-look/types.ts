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
}

/** one finding in the main reviewer's verdict; `source` is the doc, rule or tester it rests on */
export type Finding = { file: string | null; line: number | null; severity: "block" | "warn"; note: string; source: string }

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
}

/** the main reviewer's answer */
export type Verdict = {
  verdict: "pass" | "block"
  summary: string
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
