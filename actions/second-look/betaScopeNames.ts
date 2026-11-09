/**
 * the names second look's beta scope is built on, shared by the relay (scripts/bot-ci-relay), setup.sh's property
 * definition, and anything gating on second look's verdict (AI Provenance, the Slack Approve button)
 */

/** the label anyone can add to put a pr in the beta scope */
export const betaLabel = "second-look-beta"

/** the org custom property that puts a whole repo in the beta scope, and its one value */
export const betaProperty = "second-look-mode"
export const betaPropertyValue = "beta"

/** the attestation the touchless-bot mcp and the bot's workers put on a head commit, as the App */
export const attestationCheckName = "Touchless Bot MCP"

/** second look's own check on a pr (infra/second-look/checkRunBodyOf.ts) */
export const secondLookCheckName = "Second Look (beta)"

/** the `external_id` second look sets on its check in a beta-enabled run, so a gate can tell those runs apart */
export const betaExternalId = "second-look-beta"

/** the touchless bot github app, the only one whose check runs count */
export const appSlug = "touchless-bot"

/** the user second look reviews and replies as, the one people @mention or request as a reviewer */
export const reviewerLogin = "clanker-in-chief"

/** the App's own login, which posts in second look's place when clanker-in-chief's token is missing */
export const appLogin = "touchless-bot[bot]"

/** the accounts second look reviews as: clanker-in-chief, or the App when its token is missing */
export const reviewerLogins = [reviewerLogin, appLogin]
