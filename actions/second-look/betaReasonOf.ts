import { betaLabel, betaPropertyValue } from "./betaScopeNames.ts"
import type { BetaReason, BetaSignals } from "./betaScopeTypes.ts"

/** the first signal that puts a pr in the beta scope, in isBetaEnabled's order; undefined when none does */
export const betaReasonOf = (signals: BetaSignals): BetaReason | undefined => {
  if (signals.attestationLane === "beta") return "attestation"
  if (signals.repoProperty === betaPropertyValue) return "repo"
  if (signals.labels.includes(betaLabel)) return "label"
  return signals.recorded ? "recorded" : undefined
}
