import type { Family, Harness } from "./types.ts"

/** the cli a model family runs in (or a harness is), as people call it */
export const cliNameOf = (who: Family | Harness) => (who === "anthropic" || who === "claude" ? "Claude Code" : "Codex")
