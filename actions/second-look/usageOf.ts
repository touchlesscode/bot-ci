import type { Family } from "./types.ts"

/** what one agent run cost, as far as its cli says: claude's dollars and models, codex's token total */
export type AgentUsage = { costUsd?: number; models: string[]; tokensUsed?: number; turns?: number }

const numberOr = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/**
 * an agent's usage from its output. claude code's json result carries `total_cost_usd`, `num_turns` and `modelUsage`
 * (keyed by model id); codex prints "tokens used" and the total on stderr at the end of `exec`
 */
export const usageOf = ({ family, stdout, stderrTail = "" }: { family: Family; stdout: string; stderrTail?: string }): AgentUsage => {
  if (family === "openai") {
    const match = /tokens used:?\s*([\d,]+)/i.exec(stderrTail) ?? /tokens used:?\s*([\d,]+)/i.exec(stdout)
    const tokens = match ? Number(match[1].replace(/,/g, "")) : undefined
    return { models: [], ...(tokens !== undefined && Number.isFinite(tokens) ? { tokensUsed: tokens } : {}) }
  }
  const line = stdout.trim().split("\n").reverse().find((candidate) => candidate.trim().startsWith("{")) ?? ""
  try {
    const parsed = JSON.parse(line) as { total_cost_usd?: unknown; num_turns?: unknown; modelUsage?: unknown }
    const models = parsed.modelUsage && typeof parsed.modelUsage === "object" ? Object.keys(parsed.modelUsage) : []
    const costUsd = numberOr(parsed.total_cost_usd)
    const turns = numberOr(parsed.num_turns)
    return { models, ...(costUsd === undefined ? {} : { costUsd }), ...(turns === undefined ? {} : { turns }) }
  } catch {
    return { models: [] }
  }
}

/**
 * the run log's cost line, one per agent, in a fixed shape so a log search can sum them:
 * `second look cost: role=reviewer family=anthropic model=claude-opus-5-5 cost_usd=0.4312 tokens= turns=9 models=…`
 */
export const costLineOf = ({ role, family, model, usage }: { role: "reviewer" | "tester" | "answer"; family: Family; model: string; usage: AgentUsage }) =>
  `second look cost: role=${role} family=${family} model=${model} cost_usd=${usage.costUsd === undefined ? "" : usage.costUsd.toFixed(4)} tokens=${usage.tokensUsed ?? ""} turns=${usage.turns ?? ""} models=${usage.models.join(",")}`

/** "$0.43 (claude-sonnet-5-5)", "41,200 tokens", or "not reported" for the summary comment's footer */
export const costTextOf = (usage: AgentUsage | undefined) => {
  if (!usage) return "not reported"
  if (usage.costUsd !== undefined) return `$${usage.costUsd.toFixed(2)}`
  if (usage.tokensUsed !== undefined) return `${usage.tokensUsed.toLocaleString("en-US")} tokens`
  return "not reported"
}
