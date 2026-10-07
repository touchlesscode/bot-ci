import type { EarlierThread } from "./types.ts"

const maxReplyChars = 1_500

/** where a thread sits, for the prompt: its line at the head, or where it was before the code moved */
const whereOf = (thread: EarlierThread) =>
  thread.outdated || thread.line === null
    ? `${thread.path}, originally line ${thread.originalLine ?? "?"} (outdated: the code there changed since)`
    : `${thread.path}:${thread.line}`

/**
 * the prompt's list of second look's open threads on this pr: each one's spot, the finding, the replies
 * under it, and where the reviewer can read that file as it is at the head (`headFiles`)
 */
export const earlierSectionOf = ({ threads, headFiles }: { threads: EarlierThread[]; headFiles: ReadonlyMap<string, string | undefined> }) =>
  threads.length
    ? threads.map((thread) => [
      `### ${thread.key} · ${whereOf(thread)}`,
      `File at the head: ${headFiles.get(thread.path) ?? "(not in the head: deleted or moved)"}`,
      "",
      thread.finding,
      ...thread.replies.map((reply) => `\n> reply from @${reply.author}:\n> ${reply.body.slice(0, maxReplyChars).replace(/\n/g, "\n> ")}`),
    ].join("\n")).join("\n\n")
    : "(none: this is Second Look's first look at this PR, or every earlier thread is resolved)"
