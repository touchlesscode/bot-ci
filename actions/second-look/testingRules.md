# Testing rules (org default, always applied)
<!-- owner: definition-of-done -->

These apply on every repo, on top of the repo's own rules. They are the Definition of Done for bot-built PRs. Cite them as "testingRules.md".

- **Acceptance criteria have tests.** Each acceptance criterion in the PR's ticket (its "Acceptance criteria" list, else its Given/When/Then lines) is checked by at least one test: unit, or e2e for behaviour a user sees. Name the criterion that has none.
- **The PR maps each criterion to its test.** The Test Plan has one line per criterion, numbered in the ticket's order: `AC1 <criterion> → <test file> › "<test name>"`. A criterion no test can check says `manual: <how it was checked>`. A missing line, or a named test that doesn't assert its criterion, is a finding.
- **New code paths are tested.** Every new branch, error path and exported function has a unit test that exercises it. A test that calls the code without asserting what it did doesn't count.
- **User-facing changes get an e2e test.** A change to what a user sees or does (a page, a form, an API response a client renders) adds or updates a Playwright test that runs against the PR's preview: bot-ci's E2E job in repos made from app-template, exo's own e2e jobs in exo. A bot PR never skips them: no `[skip e2e]` or `[skip-checks]` in its title (PR Lint fails it), and it isn't a draft (exo runs no e2e on drafts).
- **No skipped or focused tests.** No new `.skip`, `.only`, `xit`, `xdescribe`, `test.todo` or commented-out tests, and no widened coverage `exclude`, lowered thresholds or `/* v8 ignore */` / `istanbul ignore` comments, unless the PR says why. Skipping a whole e2e suite when no preview URL is set is fine.
- **Tests assert behaviour, not implementation.** Prefer asserting outputs and visible results over mocks of internals; a test that would still pass with the feature removed is a finding.
- **Coverage is a signal, not the bar.** Repos made from app-template hold 100% through their own Vitest thresholds; bot-ci's coverage gate only warns unless the org sets `BOT_CI_COVERAGE=enforce`; exo, exo-foundation and core-db have no bot-ci gate. A coverage number never stands in for a criterion's test.
