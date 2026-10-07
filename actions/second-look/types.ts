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
  base: { sha: string; ref?: string }
  head: { sha: string; ref?: string }
  user?: { login?: string }
}

/** whether a pr gets a second look, and the line that explains it */
export type ScopeDecision = { run: boolean; reason: string }

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

/** the main reviewer's answer */
export type Verdict = {
  verdict: "pass" | "block"
  summary: string
  intent: string[]
  intendedArchitecture: string[]
  tested: string[]
  disagreements: string[]
  findings: Finding[]
}

/** read-only view of a checked-out repo, injectable for tests */
export type RepoSnapshot = {
  exists: (path: string) => boolean
  isDirectory: (path: string) => boolean
  listDirectory: (path: string) => string[]
}
