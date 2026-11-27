/** what one Second Look run cost, read off the summary comment it left on the pr (never a token, only dollars) */
export type RunCost = { runId: string; headSha: string; model: string; tier?: string; costUsd: number }

/**
 * a run's cost from second look's summary comment (commentBodyOf.ts): the run's id from its hidden marker, and from the
 * small print the head, the reviewer's model, the reviewer's dollars and the Anthropic testers' dollars, added up; the
 * risk tier from its line. a codex reviewer or tester reports tokens, not dollars, and counts for nothing here.
 * `undefined` when the comment is not a run's (no run id) or names no dollars at all. pure
 */
export const runCostOf = (body: string): RunCost | undefined => {
  const runId = /<!-- second-look-run: (\S+) -->/.exec(body)?.[1]
  const print = /<sub>Reviewed via [^(<]*\(([^)]*)\)[^<]*?head ([0-9a-f]{7})([^<]*)<\/sub>/.exec(body)
  if (!runId || !print) return undefined
  const dollars = [...(print[3] ?? "").matchAll(/(?:reviewer|Anthropic tester) cost \$(\d+(?:\.\d+)?)/g)].reduce((sum, match) => sum + Number(match[1]), 0)
  if (!(dollars > 0)) return undefined
  const tier = /\*\*Risk tier ([^:*]+):\*\*/.exec(body)?.[1]?.trim()
  return { runId, headSha: print[2]!, model: print[1]!, ...(tier ? { tier } : {}), costUsd: Math.round(dollars * 10_000) / 10_000 }
}
