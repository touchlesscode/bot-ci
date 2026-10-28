import { appSlugOf } from "./appSlugOf.ts"
import { appSlug, betaExternalId, reviewerLogins, secondLookCheckName } from "./betaScopeNames.ts"
import type { CheckRunLike, ReviewLike, SecondLookVerdict } from "./betaScopeTypes.ts"

const loginOf = (user: ReviewLike["user"]) => (typeof user === "string" ? user : user?.login ?? "").toLowerCase()

/**
 * second look's verdict on `headSha`, for a gate on a beta-enabled pr. its latest *Second Look (beta)* check on that
 * sha decides (github lists check runs newest first; only the touchless bot app's count), and its own review on that
 * sha can only make it stricter:
 * - no check on the sha, or one still running → pending (a capped or not-yet-dispatched head stays here)
 * - green → approved, unless its review on the sha requested changes. a green check from a run that wasn't
 *   beta-enabled (titled "No changes requested", no beta external_id) is never an approval → pending
 * - red (failure, action_required) → changes_requested; a review that couldn't finish is red in a beta run too
 * - neutral, cancelled, skipped, timed out → pending
 * `checkRuns` and `reviews` are github's objects or the flattened `{ app_slug, user: login }` shapes.
 */
export const secondLookVerdictOf = (checkRuns: CheckRunLike[], reviews: ReviewLike[], headSha: string): SecondLookVerdict => {
  const check = checkRuns.find((run) => run.name === secondLookCheckName && run.head_sha === headSha && [undefined, appSlug].includes(appSlugOf(run)))
  if (!check || (check.status != null && check.status !== "completed") || check.conclusion === null) return "pending"
  const review = reviews.filter((entry) => reviewerLogins.includes(loginOf(entry.user)) && entry.commit_id === headSha && ["APPROVED", "CHANGES_REQUESTED"].includes(entry.state)).at(-1)
  if (check.conclusion === "failure" || check.conclusion === "action_required") return "changes_requested"
  if (check.conclusion !== "success") return "pending"
  if (review?.state === "CHANGES_REQUESTED") return "changes_requested"
  const title = check.output?.title
  if (check.external_id !== betaExternalId && title != null && title !== "Approved") return "pending"
  return "approved"
}
