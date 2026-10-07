const mutation = `mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } } }`

/** marks a review thread resolved (graphql node id), trying each token in turn; throws when none can */
export const resolveThread = async ({ tokens, threadId, fetchImpl = fetch }: { tokens: string[]; threadId: string; fetchImpl?: typeof fetch }) => {
  const errors: string[] = []
  for (const token of [...new Set(tokens.filter(Boolean))]) {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: mutation, variables: { threadId } }),
    })
    const json = response.ok ? ((await response.json()) as { errors?: { message: string }[]; data?: { resolveReviewThread?: { thread?: { isResolved?: boolean } } } }) : undefined
    if (json?.data?.resolveReviewThread?.thread?.isResolved) return
    errors.push(json?.errors?.[0]?.message ?? `answered ${response.status}`)
  }
  throw new Error(`resolving the thread: ${errors.join("; ") || "no token"}`)
}
