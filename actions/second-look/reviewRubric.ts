/**
 * what Second Look checks a diff for, one line each, as its main reviewer is told (synthesisPrompt.ts step 4): the one
 * text both it and the Runner's self-review before a PR opens read, so the build is reviewed against the same rubric
 * it will be reviewed against on the PR. it imports nothing: it is copied flat into bot-ci's actions/second-look and
 * loaded by the worker relay (scripts/pull-slot.sh RELAY_IMPORTS)
 */
export const reviewChecklist = [
  "does it do what the ticket asks, and only that? Every acceptance criterion is met, and the diff changes nothing the ticket doesn't call for: unrelated files, refactors or features are scope creep, a warning. If designs are linked, does the UI match them?",
  "criterion → test: the PR description maps each acceptance criterion to the test that proves it (testingRules.md). Check that every listed criterion is mapped, that the named test exists (in the diff or the repo) and asserts that criterion, and that a criterion marked manual says how it was checked. A missing mapping, or a test that doesn't prove its criterion, is a warning citing testingRules.md.",
  "does it follow the repo's conventions: structure, naming, the existing patterns and helpers (duplicated, bypassed or contradicted ones), error handling, data access, dependencies?",
  "anything weird: hacks, dead or commented-out code, debug leftovers, disabled checks or tests, hardcoded values or secrets, surprising files;",
  "best practices: security, data handling, performance, accessibility for UI, and tests for new logic (CI runs them; you don't);",
  "do the PR's doc changes match its code changes?",
] as const

/** how serious a finding is, as Second Look grades it: the two severities its findings carry */
export const severityRule = `Severity: "warning" for anything that should change before merge; "nit" for small, optional polish (naming, comments, style). Leave out nits that don't matter. Don't pad: a short review of a good PR is a good review.`

/** what every finding names as its source, as Second Look asks */
export const sourceRule = `Every finding names its source: the ticket ("EXO-1234"), a design, a doc path and heading (for example "docs/ARCHITECTURE.md › Data access"), an existing pattern ("like src/api/users.ts"), "rules.md", "testingRules.md", "testing (openai)" or "testing (anthropic)", or "general judgement".`
