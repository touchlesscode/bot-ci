import { resolveThread } from "./resolveThread.ts"
import type { ConversationThread } from "./types.ts"

/**
 * resolves the threads an earlier run called fixed but couldn't resolve (fixedUnresolvedOf.ts), without replying
 * in them again. best effort per thread: a refusal is a warning and the rest carry on. resolves to the threads
 * it resolved
 */
export const resolveLeftOpen = async ({ threads, tokens, warn, fetchImpl = fetch }: {
  threads: ConversationThread[]
  tokens: string[]
  warn: (line: string) => void
  fetchImpl?: typeof fetch
}): Promise<ConversationThread[]> => {
  const resolved: ConversationThread[] = []
  for (const thread of threads) {
    await resolveThread({ tokens, threadId: thread.id, fetchImpl }).then(() => resolved.push(thread), (error: Error) =>
      warn(`${thread.path} (${thread.comments[0]?.url ?? thread.id}), called fixed on an earlier run: ${error.message}`))
  }
  return resolved
}
