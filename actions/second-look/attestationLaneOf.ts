import { appSlugOf } from "./appSlugOf.ts"
import { appSlug, attestationCheckName } from "./betaScopeNames.ts"
import type { CheckRunLike } from "./betaScopeTypes.ts"

/**
 * the `lane:` line of a head commit's `Touchless Bot MCP` attestation: only a successful one made by the touchless
 * bot app counts, since any other app or workflow can name a check the same. undefined when there's none
 */
export const attestationLaneOf = (checkRuns: CheckRunLike[], headSha?: string) => {
  const attestation = checkRuns.find((run) =>
    run.name === attestationCheckName && appSlugOf(run) === appSlug && run.conclusion === "success" && (headSha === undefined || run.head_sha === headSha))
  return (attestation?.output?.summary ?? attestation?.summary ?? "").match(/^lane:\s*(\S+)/m)?.[1]
}
