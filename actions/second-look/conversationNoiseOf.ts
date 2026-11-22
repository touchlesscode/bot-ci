/** comments that carry no review conversation: ci and release reports, stack bots, and the commands people give second look */
const noisePatterns = [
  /^\s*@clanker-in-chief\s+(review|stop|re-?review)\b[^\n]{0,40}$/i,
  /graphite\.dev|app\.graphite\.com/i,
  /^\s*(lgtm|👍|\+1|thanks!?|ty)\s*[.!🔥🚀]*\s*$/i,
]

/**
 * whether a comment is noise for the reviewer's digest: empty, by a bot account (`…[bot]`), by second look
 * itself (`ownLogins`), or one of the `noisePatterns`
 */
export const conversationNoiseOf = ({ author, body }: { author: string; body: string }, ownLogins: readonly string[]) =>
  !body.trim() || author.endsWith("[bot]") || ownLogins.includes(author) || noisePatterns.some((pattern) => pattern.test(body))
