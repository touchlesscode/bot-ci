import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import type { RunCost } from "./runCostOf.ts"

/** where one line per Second Look run is kept for the usage dashboard: the box's shared data dir (what scripts/lib/dataDirOf.ts says, restated here because bot-ci-sync publishes this folder without scripts/lib; the telemetry reader imports this one, and runCost.test.ts checks they agree) */
export const runCostLedgerPath = (environment: NodeJS.ProcessEnv = process.env) => join(environment.TOUCHLESS_DATA_DIR?.trim() || join(homedir(), ".local", "share", "touchlessbot"), "second-look", "ledger.jsonl")

/** one line of that ledger: when it was written, which pr and head, the tier, the model and the dollars. no tokens, no secrets */
export type RunCostRow = RunCost & { at: number; repo: string; pr: number }

/**
 * appends one json line for a run to the ledger, once per run: a run id already in it is left alone. creates the
 * directory. returns whether a line was written; a ledger that can't be written is not an error for the relay
 */
export const appendRunCost = ({ row, path = runCostLedgerPath() }: { row: RunCostRow; path?: string }): boolean => {
  try {
    if (existsSync(path) && readFileSync(path, "utf8").includes(`"runId":${JSON.stringify(row.runId)}`)) return false
    mkdirSync(dirname(path), { recursive: true })
    const { at, repo, pr, headSha, tier, model, costUsd, runId } = row
    appendFileSync(path, `${JSON.stringify({ at, repo, pr, headSha, ...(tier ? { tier } : {}), model, costUsd, runId })}\n`)
    return true
  } catch {
    return false
  }
}
