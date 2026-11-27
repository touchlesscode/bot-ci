import { fingerprintMarkerOf } from "./lineFingerprint.ts"
import { replyToThread } from "./replyToThread.ts"
import { resolveThread } from "./resolveThread.ts"
import { threadKeysLinkedOf } from "./threadKeysLinkedOf.ts"
import { fixedReplyOf, sameSpotReplyOf, updateReplyOf } from "./threadReplyOf.ts"
import type { EarlierThread, Family, Finding, ThreadFollowUp, ThreadStatus } from "./types.ts"

/** what happened to one earlier thread this run, for the summary comment */
export type ThreadOutcome = { thread: EarlierThread; status: ThreadStatus; note: string; resolved: boolean }

/**
 * acts on the reviewer's call for each earlier thread: a fixed one is resolved and gets a reply saying how
 * (the resolve goes first, so the reply says whether it worked), an update gets its reply, an open one is left
 * alone (a thread the reviewer skipped counts as open). a resolved thread a person answered (`resolvedBy`) can only get one reply, an update's or a same-spot one,
 * stamped with the code's fingerprint so a later run can tell whether that line changed since. new findings routed
 * onto a thread's spot are replied there. best effort per thread: a failure is a warning and the rest carry on. `resolveTokens` are tried in order (the poster, the resolve token, then the app).
 */
export const followUpThreads = async ({ threads, followUps, onThread, headSha, reviewer, token, resolveTokens, repository, number, warn, fingerprintOf = () => undefined, fetchImpl = fetch }: {
  threads: EarlierThread[]
  followUps: ThreadFollowUp[]
  onThread: { thread: EarlierThread; finding: Finding }[]
  headSha: string
  reviewer: Family
  token: string
  resolveTokens: string[]
  repository: string
  number: number
  warn: (line: string) => void
  /** the code around an answered thread's line at the head (lineFingerprint.ts), stamped on its one reply */
  fingerprintOf?: (thread: EarlierThread) => string | undefined
  fetchImpl?: typeof fetch
}): Promise<ThreadOutcome[]> => {
  const stamped = (thread: EarlierThread, body: string) => {
    const fingerprint = thread.resolvedBy ? fingerprintOf(thread) : undefined
    return fingerprint ? `${body}\n${fingerprintMarkerOf(fingerprint)}` : body
  }
  const reply = (thread: EarlierThread, body: string) => replyToThread({ token, repository, number, commentId: thread.commentId, body: stamped(thread, body), fetchImpl })
  const linked = threadKeysLinkedOf(threads)
  const outcomes: ThreadOutcome[] = []
  for (const thread of threads) {
    const call = followUps.find((followUp) => followUp.thread === thread.key)
    // a resolved thread a person answered only ever gets a reply: it's never re-resolved or counted as fixed
    const asked = thread.resolvedBy && call?.status === "fixed" ? "open" : call?.status
    const status = asked === "update" && !call?.note.trim() ? "open" : asked ?? "open"
    const note = linked(call?.note ?? "")
    let resolved = false
    try {
      if (status === "update") await reply(thread, updateReplyOf({ note, headSha, reviewer }))
      if (status === "fixed") {
        resolved = await resolveThread({ tokens: resolveTokens, threadId: thread.id, fetchImpl }).then(() => true, (error: Error) => {
          warn(`${thread.path} (${thread.url}): ${error.message}`)
          return false
        })
        await reply(thread, fixedReplyOf({ note, headSha, reviewer, resolved }))
      }
    } catch (error) {
      warn(`${thread.path} (${thread.url}): ${(error as Error).message}`)
    }
    outcomes.push({ thread, status, note, resolved })
  }
  const answeredOnce = new Set(outcomes.filter(({ thread, status }) => thread.resolvedBy && status === "update").map(({ thread }) => thread.key))
  for (const { thread, finding } of onThread) {
    if (thread.resolvedBy && answeredOnce.has(thread.key)) continue
    if (thread.resolvedBy) answeredOnce.add(thread.key)
    await reply(thread, sameSpotReplyOf({ finding, reviewer })).catch((error: Error) => warn(`${thread.path} (${thread.url}): ${error.message}`))
  }
  return outcomes
}

/** the earlier threads still open after this run: not fixed, and not one a person already answered and resolved */
export const stillOpenOf = (outcomes: ThreadOutcome[]) => outcomes.filter(({ thread, status }) => status !== "fixed" && !thread.resolvedBy)
