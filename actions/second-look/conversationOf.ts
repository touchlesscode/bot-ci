import type { ConversationComment, ConversationThread, PullConversation } from "./types.ts"

type CommentNode = { databaseId?: number; url?: string; body: string; createdAt: string; author: { login: string } | null }
type ThreadNode = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  resolvedBy: { login: string } | null
  path: string
  line: number | null
  originalLine: number | null
  /** the thread's first comment; `comments` holds the newest 50 */
  opening?: { nodes: CommentNode[] }
  comments: { nodes: CommentNode[] }
}
type ReviewNode = { author: { login: string } | null; state: string; body: string; submittedAt: string | null; commit: { oid: string } | null }
type Page = {
  reviewThreads: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ThreadNode[] }
  reviews?: { nodes: ReviewNode[] }
  comments?: { nodes: CommentNode[] }
}

const query = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved isOutdated resolvedBy { login } path line originalLine opening: comments(first: 1) { nodes { databaseId url body createdAt author { login } } } comments(last: 50) { nodes { databaseId url body createdAt author { login } } } }
      }
      reviews(last: 60) { nodes { author { login } state body submittedAt commit { oid } } }
      comments(last: 100) { nodes { url body createdAt author { login } } }
    }
  }
}`

const commentOf = (node: CommentNode): ConversationComment => ({ author: node.author?.login ?? "ghost", body: node.body, createdAt: node.createdAt, databaseId: node.databaseId, url: node.url })

/**
 * everything said on a pr so far, for the reviewer's conversation digest: every inline thread (resolved and
 * outdated ones too, by anyone, each with its first comment and newest 50 replies), the last 60 reviews and the last 100 conversation comments
 */
export const conversationOf = async ({ token, repository, number, fetchImpl = fetch }: {
  token: string
  repository: string
  number: number
  fetchImpl?: typeof fetch
}): Promise<PullConversation> => {
  const [owner, name] = repository.split("/")
  const pageOf = async (after: string | null): Promise<Page | undefined> => {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { owner, name, number, after } }),
    })
    if (!response.ok) throw new Error(`reading the PR's conversation answered ${response.status}`)
    const json = (await response.json()) as { errors?: { message: string }[]; data?: { repository?: { pullRequest?: Page } } }
    if (json.errors?.length) throw new Error(`reading the PR's conversation: ${json.errors[0].message}`)
    return json.data?.repository?.pullRequest
  }
  const first = await pageOf(null)
  if (!first) return { threads: [], reviews: [], comments: [] }
  const nodes = [...first.reviewThreads.nodes]
  let info = first.reviewThreads.pageInfo
  while (info.hasNextPage) {
    const next = await pageOf(info.endCursor)
    if (!next) break
    nodes.push(...next.reviewThreads.nodes)
    info = next.reviewThreads.pageInfo
  }
  const threads: ConversationThread[] = nodes.map((node) => ({
    id: node.id,
    resolved: node.isResolved,
    resolvedBy: node.resolvedBy?.login ?? null,
    outdated: node.isOutdated,
    path: node.path,
    line: node.line,
    originalLine: node.originalLine,
    // the finding itself, then the newest 50 replies: on a long thread the last answer and second look's own reply are what count
    comments: [...(node.opening?.nodes ?? []), ...node.comments.nodes].filter((comment, index, all) => all.findIndex((other) => (other.databaseId ?? other.url ?? other.createdAt) === (comment.databaseId ?? comment.url ?? comment.createdAt)) === index).map(commentOf),
  }))
  return {
    threads,
    reviews: (first.reviews?.nodes ?? []).map((node) => ({ author: node.author?.login ?? "ghost", state: node.state, body: node.body, submittedAt: node.submittedAt ?? "", commit: node.commit?.oid ?? "" })),
    comments: (first.comments?.nodes ?? []).map(commentOf),
  }
}
