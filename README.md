# org-ci

Org-wide required workflows for touchlesscode, applied to every repo's default branch by the org ruleset `org-ci`. They run on Ubicloud.

- `pr-lint` applies exo's PR title and description rules (`type(scope): … | EXO-1234`; Summary, Jira Ticket Reference, Test Plan).
- `org-ci` runs for repos with no pull request CI of their own:
  - NX workspaces get exo's pipeline: `nx-set-shas`, `nx affected -t build|lint|typecheck|test`, the pnpm store cache.
  - Other Node repos get their own scripts.
  - Then each affected Cloudflare Worker app gets a staging preview at `<app>-<branch>-pr.touchlessapis.com`.
- `arch-governor` reviews bot-authored PRs using the other model family.

`reap-previews` runs here nightly and deletes previews that haven't been redeployed in a week.

Managed from `touchless-bot` `infra/org-ci` by `setup.sh`. Changes made here are overwritten on the next sync.
