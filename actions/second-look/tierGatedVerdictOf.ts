import { techLeads, tierOverrideLabel, tierRestrictedAuthors } from "./riskTiers.ts"
import type { Verdict } from "./types.ts"

/** the warning the gate adds: whole-pr, so it shows in the summary, not on a line */
const gateFindingOf = (verdict: Verdict, author: string) => ({
  file: null,
  line: null,
  severity: "warning" as const,
  note: `This is Tier ${verdict.tier} work (${verdict.tierReason.replace(/\.$/, "")}), and @${author} can raise only Tier 0 (copy, accessibility, CSS, tests). A tech lead (${techLeads.map((login) => `@${login}`).join(", ")}) can override by adding the \`${tierOverrideLabel}\` label, then commenting \`@clanker-in-chief review this\`.`,
  source: "risk tiers",
})

/**
 * the reviewer's verdict with the risk-tier rules applied: a pr by a tier-restricted author (riskTiers.ts) that the
 * reviewer put at tier 1 or 2 is a block, with a warning saying why and how to override, unless `overriddenBy` (a
 * tech lead who added the override label) is set. every other verdict is returned unchanged
 */
export const tierGatedVerdictOf = ({ verdict, author, overriddenBy }: { verdict: Verdict | undefined; author: string | undefined; overriddenBy?: string }): Verdict | undefined => {
  if (!verdict || !author || verdict.tier === 0 || overriddenBy) return verdict
  if (!tierRestrictedAuthors.some((login) => login.toLowerCase() === author.toLowerCase())) return verdict
  return {
    ...verdict,
    verdict: "block",
    summary: `Tier ${verdict.tier}, which @${author} can't raise without a tech lead's override. ${verdict.summary}`,
    findings: [gateFindingOf(verdict, author), ...verdict.findings],
  }
}
