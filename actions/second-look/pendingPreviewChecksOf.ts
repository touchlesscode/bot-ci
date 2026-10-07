/** the slice of a github check run the preview wait reads */
export type CheckRun = { name: string; status: string }

const previewProducing = /^(build|previews)$|preview|deploy/i
const secondLooksOwn = /^(scope|openai tester|anthropic tester|main reviewer)$/i

/**
 * the head commit's checks that still might deploy (or post) a preview: bot-ci's Build and Previews,
 * exo's "Setup, Build, Check & Deploy" and "Post Preview Link(s)", and the like, while they aren't done
 */
export const pendingPreviewChecksOf = (checkRuns: CheckRun[]) =>
  checkRuns.filter((run) => run.status !== "completed" && previewProducing.test(run.name) && !secondLooksOwn.test(run.name)).map((run) => run.name)
