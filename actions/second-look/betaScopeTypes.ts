/**
 * what decides whether a pr is beta-enabled: the lane on the App's `Touchless Bot MCP` attestation of its head, the
 * repo's `second-look-mode` property, the pr's labels, and whether the relay already recorded it (sticky)
 */
export type BetaSignals = { attestationLane?: string; repoProperty?: string; labels: string[]; recorded: boolean }

/** which signal put a pr in the beta scope, recorded in scope.json */
export type BetaReason = "attestation" | "repo" | "label" | "recorded"

/** the slice of a github check run the gate reads; `app_slug` is a flattened `app.slug`, either works */
export type CheckRunLike = {
  name: string
  head_sha: string
  status?: string | null
  conclusion: string | null
  app_slug?: string
  app?: { slug?: string } | null
  external_id?: string | null
  output?: { title?: string | null; summary?: string | null } | null
  summary?: string | null
}

/** the slice of a github pull request review the gate reads; `user` is a login or github's user object */
export type ReviewLike = { user: string | { login?: string } | null; state: string; commit_id: string }

/** second look's verdict on one head commit */
export type SecondLookVerdict = "approved" | "changes_requested" | "pending"
