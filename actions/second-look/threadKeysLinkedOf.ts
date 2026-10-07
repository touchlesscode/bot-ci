import type { EarlierThread } from "./types.ts"

/**
 * swaps the prompt's thread keys (T1, T2…) the reviewer let slip into its prose for a link to that
 * thread named by its file, since nobody reading the pr knows the keys. unknown keys are left as they are.
 */
export const threadKeysLinkedOf = (threads: EarlierThread[]) => {
  const byKey = new Map(threads.map((thread) => [thread.key, thread]))
  return (text: string) => text.replace(/\(?\b(T\d+)\b\)?/g, (match, key: string) => {
    const thread = byKey.get(key)
    return thread ? `${match.startsWith("(") ? "(" : ""}[\`${thread.path.split("/").at(-1)}\`](${thread.url})${match.endsWith(")") ? ")" : ""}` : match
  })
}
