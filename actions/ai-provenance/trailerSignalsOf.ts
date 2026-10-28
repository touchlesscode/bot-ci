const coAuthorAgents: [RegExp, string][] = [
  [/\bclaude\b/i, "Co-Authored-By: Claude"],
  [/\bcursor\s*agent\b|\bcursoragent\b/i, "Co-authored-by: Cursor Agent"],
  [/\bcodex\b/i, "Co-authored-by: Codex"],
]

/**
 * the coding-agent trailers in one commit message: `Co-Authored-By:` naming
 * Claude, Cursor Agent (cursoragent@cursor.com) or Codex, and any
 * `Generated-By:` / `AI-Agent:` trailer. trailers are matched on their own
 * line anywhere in the message, case-insensitively, like git does.
 */
export const trailerSignalsOf = (message: string) => {
  const signals = new Set<string>()
  for (const line of message.split(/\r?\n/)) {
    const coAuthor = line.match(/^\s*co-authored-by\s*:\s*(.+)$/i)?.[1]
    if (coAuthor) for (const [pattern, signal] of coAuthorAgents) if (pattern.test(coAuthor)) signals.add(signal)
    const named = line.match(/^\s*(generated-by|ai-agent)\s*:\s*\S/i)?.[1]
    if (named) signals.add(named.toLowerCase() === "ai-agent" ? "AI-Agent:" : "Generated-By:")
  }
  return [...signals]
}
