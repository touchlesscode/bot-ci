import { trailerSignalsOf } from "./trailerSignalsOf.ts"

/** pr authors that are coding agents themselves */
export const agentAppLogins = ["cursor[bot]", "claude[bot]", "chatgpt-codex-connector[bot]", "copilot-swe-agent[bot]", "devin-ai-integration[bot]"]

export type PullCommit = { sha: string; message: string }

/**
 * why a pr looks harness-made: agent trailers on any of its commits (with the
 * short sha they're on), or a known agent app as the pr author. empty means
 * human-made, and AI Provenance passes at once.
 */
export const harnessSignalsOf = ({ commits, author }: { commits: PullCommit[]; author?: string }) => [
  ...(author && agentAppLogins.includes(author.toLowerCase()) ? [`opened by ${author}`] : []),
  ...commits.flatMap((commit) => trailerSignalsOf(commit.message).map((signal) => `${signal} on ${commit.sha.slice(0, 7)}`)),
]
