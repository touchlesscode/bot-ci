import { existsSync, readFileSync } from "node:fs"
import type { Family } from "./types.ts"

type ClaudeResult = { result?: string; structured_output?: unknown; total_cost_usd?: number; is_error?: boolean; subtype?: string }

/**
 * an agent's final answer and cost. claude prints one json result on stdout
 * (`structured_output` when --json-schema took, else the text in `result`);
 * codex writes its last message to the `--output-last-message` file.
 */
export const finalMessageOf = ({ family, stdout, outputPath }: { family: Family; stdout: string; outputPath: string }): { text: string; costUsd?: number } => {
  if (family === "openai") return { text: existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "" }
  const line = stdout.trim().split("\n").reverse().find((candidate) => candidate.trim().startsWith("{")) ?? ""
  try {
    const parsed = JSON.parse(line) as ClaudeResult
    const text = parsed.structured_output && typeof parsed.structured_output === "object" ? JSON.stringify(parsed.structured_output) : parsed.result ?? ""
    return { text: text || `claude ended without an answer (${parsed.subtype ?? "unknown"})`, costUsd: parsed.total_cost_usd }
  } catch {
    return { text: stdout }
  }
}
