import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * what Second Look wants said on its pr. the job doesn't post it: it uploads the file as a
 * `bot-ci-posts-<job>` artifact, and the touchless bot's relay on the Studio
 * (scripts/bot-ci-relay) posts it as the Touchless Bot GitHub App. checked by scripts/bot-ci-relay/postsOf.ts.
 */
export type BotPost = { kind: "sticky-comment"; marker: string; body: string }

/** one queued post file: what to say, and on which pr at which head */
export type QueuedPost = { version: 1; repository: string; number: number; headSha: string; post: BotPost }

/** who posts: the touchless bot through the relay (default), or the job's own token (`BOT_CI_POST_AS=github-actions`) */
export const posterOf = (value: string | undefined) => (value === "github-actions" ? "github-actions" : "touchless-bot")

/** writes one post for the relay into `directory` (the job uploads it); returns the file path */
export const queuePost = ({ directory, ...queued }: Omit<QueuedPost, "version"> & { directory: string }) => {
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${queued.post.kind}.json`)
  writeFileSync(path, JSON.stringify({ version: 1, ...queued }))
  return path
}
