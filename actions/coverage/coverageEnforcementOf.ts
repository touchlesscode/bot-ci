import type { CoverageEnforcement } from "./types.ts"

/** BOT_CI_COVERAGE as an enforcement; anything unset or unknown is `evaluate`, so a typo never turns the gate off */
export const coverageEnforcementOf = (value: string | undefined): CoverageEnforcement => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "enforce" || normalized === "off") return normalized
  return "evaluate"
}
