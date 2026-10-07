# bot-ci

The CI and guardrails for bot-built code in touchlesscode, required on every repo's default branch by the org ruleset `bot-ci`. They run on Ubicloud.

- **PR Lint** applies exo's PR title and description rules (`type(scope): … | EXO-1234`; Summary, Jira Ticket Reference, Test Plan) to the bot's PRs.
- **Build** runs for repos with no pull request CI of their own:
  - NX workspaces get exo's pipeline: `nx-set-shas`, `nx affected -t build|lint|typecheck|test`, the pnpm store cache.
  - Other Node repos get their own scripts.
  - It bundles each affected Cloudflare Worker app; **Previews**, a separate job that never runs the PR's code, deploys them to `<app>-<branch>-pr.touchlessapis.com`.
- **Second Look (beta)** is opt-in: comment `@touchless-bot run this` on a PR. An OpenAI and an Anthropic tester each follow its test plan, against its previews when they're up, then a main reviewer reads the repo's docs and reviews the change against them. Touchless Bot posts one sticky comment; advisory.

**Reap Previews** runs here nightly and deletes previews that haven't been redeployed in a week.

Managed from `touchless-bot` `infra/bot-ci` by `setup.sh`. Changes made here are overwritten on the next sync.
