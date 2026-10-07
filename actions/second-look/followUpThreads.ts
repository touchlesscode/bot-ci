import { replyToThread } from "./replyToThread.ts"
import { resolveThread } from "./resolveThread.ts"
import { fixedReplyOf, sameSpotReplyOf, updateReplyOf } from "./threadReplyOf.ts"
import type { EarlierThread, Finding, ThreadFollowUp, ThreadStatus } from "./types.ts"

/** what happened to one earlier thread this run, for the summary comment */
export type ThreadOutcome = { thread: EarlierThread; status: ThreadStatus; note: string; resolved: boolean }

/**
 * acts on the reviewer's call for each earlier thread: a fixed one gets a reply saying how and is
 * resolved, an update gets its reply, an open one is left alone (a thread the reviewer skipped counts as
 * open). new findings routed onto a thread's spot are replied there. best effort per thread: a failure
 * is a warning and the rest carry on. `resolveTokens` are tried in order (the poster, then the app).
 */
export const followUpThreads = async ({ threads, followUps, onThread, headSha, token, resolveTokens, repository, number, warn, fetchImpl = fetch }: {
  threads: EarlierThread[]
  followUps: ThreadFollowUp[]
  onThread: { thread: EarlierThread; finding: Finding }[]
  headSha: string
  token: string
  resolveTokens: string[]
  repository: string
  number: number
  warn: (line: string) => void
  fetchImpl?: typeof fetch
}): Promise<ThreadOutcome[]> => {
  const reply = (thread: EarlierThread, body: string) => replyToThread({ token, repository, number, commentId: thread.commentId, body, fetchImpl })
  const outcomes: ThreadOutcome[] = []
  for (const thread of threads) {
    const call = followUps.find((followUp) => followUp.thread === thread.key)
    const status = call?.status === "update" && !call.note.trim() ? "open" : call?.status ?? "open"
    const note = call?.note ?? ""
    let resolved = false
    try {
      if (status === "update") await reply(thread, updateReplyOf({ note, headSha }))
      if (status === "fixed") {
        await reply(thread, fixedReplyOf({ note, headSha }))
        await resolveThread({ tokens: resolveTokens, threadId: thread.id, fetchImpl })
        resolved = true
      }
    } catch (error) {
      warn(`${thread.path} (${thread.url}): ${(error as Error).message}`)
    }
    outcomes.push({ thread, status, note, resolved })
  }
  for (const { thread, finding } of onThread) await reply(thread, sameSpotReplyOf({ finding, headSha })).catch((error: Error) => warn(`${thread.path} (${thread.url}): ${error.message}`))
  return outcomes
}
