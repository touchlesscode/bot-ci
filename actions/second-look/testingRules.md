# Testing rules (org default, always applied)

These apply on every repo, on top of the repo's own rules. Cite them as "testingRules.md".

- **Acceptance criteria have tests.** Each acceptance criterion in the PR's ticket is checked by at least one test (unit, or e2e for behaviour a user sees). Name the criterion that has none. A criterion that can't be tested automatically says so in the PR's Test Plan, with how it was checked by hand.
- **New code paths are tested.** Every new branch, error path and exported function has a unit test that exercises it. Coverage that only comes from a test calling the code without asserting on what it did doesn't count.
- **No skipped or focused tests.** No new `.skip`, `.only`, `xit`, `xdescribe`, `test.todo` or commented-out tests, and no widened coverage `exclude`, lowered thresholds or `/* v8 ignore */` / `istanbul ignore` comments, unless the PR says why. Skipping a whole e2e suite when no preview URL is set is fine.
- **User-facing changes get an e2e test.** A change to what a user sees or does (a page, a form, an API response a client renders) adds or updates a Playwright test under the app's `e2e/`, run against the preview by bot-ci's E2E job.
- **Tests assert behaviour, not implementation.** Prefer asserting outputs and visible results over mocks of internals; a test that would still pass with the feature removed is a finding.
