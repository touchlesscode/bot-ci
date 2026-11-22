import { redactedOf } from "./redactedOf.ts"
import type { Family, ProviderError } from "./types.ts"

const providerName: Record<Family, string> = { anthropic: "Anthropic", openai: "OpenAI" }

/**
 * what each provider prints when it refuses on money or credentials, phrase by phrase, so a model's own words
 * about billing code never match: claude code's `result` text and codex's error lines. `kind` says which it is
 */
const patterns: { kind: ProviderError["kind"]; pattern: RegExp }[] = [
  { kind: "billing", pattern: /credit balance is too low/i },
  { kind: "billing", pattern: /insufficient_quota|exceeded your current quota|quota exceeded\. check your plan and billing/i },
  { kind: "billing", pattern: /billing_hard_limit_reached|billing hard limit/i },
  { kind: "billing", pattern: /you have reached your specified api usage limits/i },
  { kind: "auth", pattern: /invalid x-api-key|invalid api key|incorrect api key provided|invalid_api_key|authentication_error/i },
  { kind: "auth", pattern: /organization has been disabled|account_deactivated|this organization has been disabled/i },
]

/** the line that matched, trimmed of json and log noise, at most 200 characters */
const lineOf = (text: string, pattern: RegExp) => {
  const line = text.split("\n").find((candidate) => pattern.test(candidate)) ?? ""
  const message = /"result"\s*:\s*"([^"]*)"/.exec(line)?.[1] ?? line
  return redactedOf(message.replace(/\s+/g, " ").trim()).slice(0, 200)
}

/**
 * a provider's billing, quota or credential refusal in `text`, or undefined. `text` must be the cli's own error output
 * (cliErrorTextOf), never the model's answer, which can quote an app's or a pr's "invalid api key". `family` is whose
 * key the agent used
 */
export const providerErrorOf = (family: Family, text: string): ProviderError | undefined => {
  for (const { kind, pattern } of patterns) {
    if (pattern.test(text)) return { provider: providerName[family], family, kind, message: lineOf(text, pattern) }
  }
  return undefined
}

/** one plain sentence for a person: "Anthropic refused the request: credit balance is too low (billing)" */
export const providerErrorLineOf = (error: ProviderError) =>
  `${error.provider} refused the request${error.message ? `: ${error.message.replace(/[.\s]+$/, "")}` : ""} (${error.kind === "auth" ? "API key or account" : "credit or quota"})`

/** codex's own error lines on stderr ("ERROR: …", "stream error: …", "unexpected status 401 …"), not the commands it ran */
const codexErrorLine = /^\s*(\[[^\]]*\]\s*)?(error\b|stream error)|unexpected status \d{3}/i

/**
 * the part of an agent run that is the cli reporting its own failure, the only text a provider refusal is looked for in:
 * - claude code: the `result` of a json result with `is_error: true`; with no json result at all, a failed exit's stdout
 *   and stderr (the cli died before answering). a normal result, however it reads, is the model's answer: nothing
 * - codex: on a failed exit, only its own error lines on stderr; its answer is in a file and the commands it ran
 *   (with their output) are never searched
 */
export const cliErrorTextOf = ({ family, stdout, stderrTail = "", code }: { family: Family; stdout: string; stderrTail?: string; code: number | null }) => {
  if (family === "openai") return code === 0 ? "" : stderrTail.split("\n").filter((line) => codexErrorLine.test(line)).join("\n")
  const line = stdout.trim().split("\n").reverse().find((candidate) => candidate.trim().startsWith("{"))
  if (line) {
    try {
      const parsed = JSON.parse(line) as { is_error?: unknown; result?: unknown }
      return parsed.is_error === true && typeof parsed.result === "string" ? parsed.result : ""
    } catch {
      // not claude's result line: fall through to a failed exit's output
    }
  }
  return code === 0 ? "" : `${stdout.slice(-4_096)}\n${stderrTail}`
}
