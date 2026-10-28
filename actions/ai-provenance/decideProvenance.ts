import type { Attestation } from "./attestationOf.ts"
import type { SecondLookVerdict } from "./secondLookAdapter.ts"

/** the failure text for a harness-made pr without a current attestation (exact; people search for it) */
export const outsideMcpFailure = "made by a personal harness outside the touchless-bot MCP: resubmit with open_pr / update_pr"

export type ProvenanceMode = "evaluate" | "enforce"

export type ProvenanceInput = { harnessSignals: string[]; attestation: Attestation; betaEnabled: boolean; verdict: SecondLookVerdict; mode: ProvenanceMode }

export type ProvenanceDecision = { state: "success" | "failure" | "neutral" | "pending"; title: string; would?: "failure" | "pending" }

/**
 * the check's outcome:
 * 1. harness-made (any signal) without the App's attestation on the current
 *    head → failure, with `outsideMcpFailure`;
 * 2. beta-enabled → pending until Second Look has a verdict on the head;
 *    approved passes, changes requested fails;
 * 3. otherwise success (human-made prs pass at once).
 * in `evaluate` mode nothing blocks or waits: a failure or pending becomes
 * neutral, and `would` says what enforce would have done.
 */
export const decideProvenance = ({ harnessSignals, attestation, betaEnabled, verdict, mode }: ProvenanceInput): ProvenanceDecision => {
  const harness = harnessSignals.length > 0
  const decided: ProvenanceDecision =
    harness && !attestation.attested ? { state: "failure", title: outsideMcpFailure }
    : betaEnabled && verdict === "pending" ? { state: "pending", title: "beta-enabled PR: waiting for Second Look's verdict on this head" }
    : betaEnabled && verdict === "changes_requested" ? { state: "failure", title: "beta-enabled PR: Second Look requested changes on this head; address them and push (then update_pr if a harness made it)" }
    : betaEnabled ? { state: "success", title: harness ? "attested through the touchless-bot MCP, and Second Look approved this head" : "Second Look approved this head" }
    : harness ? { state: "success", title: "harness-made and attested through the touchless-bot MCP" }
    : { state: "success", title: "no coding-agent signals: human-made" }
  if (mode === "enforce" || decided.state === "success") return decided
  return { state: "neutral", title: `evaluate mode, not blocking: ${decided.title}`, would: decided.state as "failure" | "pending" }
}
