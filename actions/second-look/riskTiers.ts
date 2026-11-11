/** how risky a pr is to merge: 0 copy, accessibility, css, tests; 1 standard work; 2 edge/runtime, auth, data migrations, the speed layer */
export type RiskTier = 0 | 1 | 2

/** the review-by-risk-tier rubric, word for word as engineering leads agreed it (14 Oct 2026); the main reviewer classifies every pr by it */
export const riskTierRubric = `Review by risk tier:

Tier 0 (copy, accessibility, CSS, tests): automated review plus any engineer | anyone can raise
Tier 1 (standard work): automated review plus one engineer | engineers can raise, or special circumstances
Tier 2 (edge/runtime, auth, data migrations, the speed layer): automated review plus the area owner, then a canary release | engineers can raise, or special circumstances`

/** github logins that may raise only tier 0: a pr of theirs the reviewer puts at tier 1 or 2 is rejected until a tech lead overrides it */
export const tierRestrictedAuthors: readonly string[] = ["kmountsier"]

/** the tech leads who can override that rejection: Stef, Ali and Rob */
export const techLeads: readonly string[] = ["stefbbq", "alihamoody", "crimeminister"]

/** the label a tech lead adds to override the rejection; it counts only while the latest add of it was by a tech lead */
export const tierOverrideLabel = "risk-tier-override"
