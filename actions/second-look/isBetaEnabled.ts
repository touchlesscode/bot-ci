import { betaLabel, betaPropertyValue } from "./betaScopeNames.ts"
import type { BetaSignals } from "./betaScopeTypes.ts"

/**
 * whether a pr is in second look's beta scope: any one signal is enough. its head's App attestation says
 * `lane: beta`, its repo's `second-look-mode` property is `beta`, it carries the `second-look-beta` label, or the
 * relay already recorded it (once enabled it stays enabled, so removing the label doesn't switch it off)
 */
export const isBetaEnabled = (signals: BetaSignals): boolean =>
  signals.attestationLane === "beta" || signals.repoProperty === betaPropertyValue || signals.labels.includes(betaLabel) || signals.recorded
