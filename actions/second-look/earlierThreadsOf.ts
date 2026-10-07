import { findingMarker } from "./inlineCommentsOf.ts"
import type { EarlierThread } from "./types.ts"

type ThreadNode = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  originalLine: number | null
  comments: { nodes: { databaseId: number; url: string; body: string; author: { login: string } | null }[] }
}

const query = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { databaseId url body author { login } } } }
      }
    }
  }
}`

/** a finding comment's text without second look's marker and header line */
const findingTextOf = (body: string) => body.replace(findingMarker, "").replace(/^\s*\*\*Second Look \(beta\)\*\*[^\n]*\n+/, "").trim()

/**
 * the unresolved inline threads second look started on a pr (first comment by `author`, with the
 * finding marker), outdated ones included: those are where a fix most likely landed. keyed T1, T2… for
 * the reviewer's prompt, with every later reply so it can answer people.
 */
export const earlierThreadsOf = async ({ token, repository, number, author, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  author: string
  fetchImpl?: typeof fetch
}): Promise<EarlierThread[]> => {
  const [owner, name] = repository.split("/")
  const pageOf = async (after: string | null): Promise<ThreadNode[]> => {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { owner, name, number, after } }),
    })
    if (!response.ok) throw new Error(`listing review threads answered ${response.status}`)
    const json = (await response.json()) as { errors?: { message: string }[]; data?: { repository?: { pullRequest?: { reviewThreads?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ThreadNode[] } } } } }
    if (json.errors?.length) throw new Error(`listing review threads: ${json.errors[0].message}`)
    const threads = json.data?.repository?.pullRequest?.reviewThreads
    if (!threads) return []
    return threads.pageInfo.hasNextPage ? [...threads.nodes, ...(await pageOf(threads.pageInfo.endCursor))] : threads.nodes
  }
  return (await pageOf(null))
    .filter((thread) => !thread.isResolved && thread.comments.nodes[0]?.author?.login === author && thread.comments.nodes[0].body.includes(findingMarker))
    .map((thread, index) => {
      const [first, ...later] = thread.comments.nodes
      return {
        key: `T${index + 1}`,
        id: thread.id,
        commentId: first.databaseId,
        url: first.url,
        path: thread.path,
        line: thread.line,
        originalLine: thread.originalLine,
        outdated: thread.isOutdated,
        finding: findingTextOf(first.body),
        replies: later.map((comment) => ({ author: comment.author?.login ?? "ghost", body: comment.body })),
      }
    })
}
