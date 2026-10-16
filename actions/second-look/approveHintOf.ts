/** the comment that forces an approval; the relay (scripts/bot-ci-relay/requestOf.ts) acts on it */
export const approveCommand = "@clanker-in-chief approve"

/**
 * the line under a review that didn't approve: tags the pr's author (not a bot, which can't read it) and tells them
 * they can force an approval for now
 */
export const approveHintOf = (author?: string) => {
  const who = author && !author.endsWith("[bot]") ? `@${author}: ` : ""
  return `${who}if this shouldn't hold the PR up, comment \`${approveCommand}\` (add why after it) and I'll approve it anyway.`
}
