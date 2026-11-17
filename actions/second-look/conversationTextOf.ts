import { redactedOf } from "./redactedOf.ts"

/**
 * a comment's words for the reviewer's conversation digest, on one line and at most `max` characters: html
 * comments, collapsed `<details>` blocks (logs, walkthroughs), code blocks, images, tags and second look's own
 * footnotes dropped, credentials redacted
 */
export const conversationTextOf = (body: string, max: number) => {
  const text = redactedOf(body)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<details>[\s\S]*?<\/details>/gi, " ")
    .replace(/```[\s\S]*?(```|$)/g, " [code] ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<sub>[\s\S]*?<\/sub>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
