/** the pr reply when a run ended without a review; `stage` is where it stopped, prepare or review */
export const unfinishedReplyOf = ({ result, stage, detailsUrl }: { result: string; stage: string; detailsUrl: string }) =>
  stage === "prepare"
    ? `**Second Look (beta)** couldn't get started on this PR (Prepare: ${result}), so there's no review coming. That's usually the Touchless Bot GitHub App missing a permission or a PR the run can't read; [the run](${detailsUrl}) in the private second-look repo has the details. Comment \`@clanker-in-chief review this\` to try again once it's fixed.`
    : `**Second Look (beta)** didn't get to a review on this PR (${result}). [The run](${detailsUrl}) in the private second-look repo has the details; comment \`@clanker-in-chief review this\` to try again.`
