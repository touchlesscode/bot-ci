import type { Severity } from "./types.ts"

/** the bold lead-in a finding opens with: `**Warning:**` or `**Nit:**` */
export const labelOf = (severity: Severity) => `**${severity === "nit" ? "Nit" : "Warning"}:**`
