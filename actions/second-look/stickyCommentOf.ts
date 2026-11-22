import { issueCommentsOf, type IssueComment } from "./issueCommentsOf.ts"

/**
 * the one pr comment that carries `marker` (by `author` when given, since a token can't edit another account's),
 * the newest when there are several. pages through every comment: the sticky one is edited in place and keeps its
 * first date, so on a long pr it sits far behind the latest 100
 */
export const stickyCommentOf = async ({ token, repository, number, marker, author, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  marker: string
  author?: string
  fetchImpl?: typeof fetch
}): Promise<IssueComment | undefined> =>
  (await issueCommentsOf({ token, repository, number, fetchImpl })).filter((comment) => comment.body?.includes(marker) && (!author || comment.user?.login === author)).at(-1)
