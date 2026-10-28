import type { Attestation } from "./attestationOf.ts"
import type { ProvenanceDecision, ProvenanceMode } from "./decideProvenance.ts"
import type { BetaSignals, SecondLookVerdict } from "./secondLookAdapter.ts"

const icons = { success: "✅", failure: "❌", neutral: "⚪", pending: "⏳" } as const

/** the markdown job summary (and evaluate-mode check text): the outcome, then every input it was decided from */
export const reportOf = ({ decision, mode, headSha, harnessSignals, attestation, beta, betaEnabled, verdict }: { decision: ProvenanceDecision; mode: ProvenanceMode; headSha: string; harnessSignals: string[]; attestation: Attestation; beta: BetaSignals; betaEnabled: boolean; verdict: SecondLookVerdict }) =>
  [
    `### ${icons[decision.state]} AI Provenance: ${decision.title}`,
    "",
    `- mode: \`${mode}\`${decision.would ? ` (enforce would be **${decision.would}**)` : ""}`,
    `- head: \`${headSha.slice(0, 12)}\``,
    `- harness signals: ${harnessSignals.length ? harnessSignals.map((signal) => `\`${signal}\``).join(", ") : "none"}`,
    `- attestation: ${attestation.attested ? `yes (lane \`${attestation.lane ?? "?"}\`, requester \`${attestation.requester ?? "?"}\`, ticket \`${attestation.ticket ?? "?"}\`, via \`${attestation.via ?? "?"}\`)` : `no: ${attestation.reason}`}`,
    `- beta-enabled: ${betaEnabled ? "yes" : "no"} (attestation lane \`${beta.attestationLane ?? "none"}\`, repo second-look-mode \`${beta.repoProperty ?? "unset"}\`, label ${beta.labels.includes("second-look-beta") ? "on" : "off"}, recorded ${beta.recorded ? "yes" : "no"})`,
    `- Second Look on this head: \`${verdict}\``,
    "",
    harnessSignals.length && !attestation.attested ? "A coding agent made commits here (trailers or the PR author), and the current head has no `Touchless Bot MCP` check from the Touchless Bot App. From the harness, call the touchless-bot MCP's `open_pr` (new PR) or `update_pr` (after a push) and this check re-runs." : "",
  ].filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== "")).join("\n")
