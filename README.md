# bot-ci

The CI and guardrails for bot-built code in touchlesscode. Org rulesets make it apply to every repo's default branch without anyone adding files to the repo, and everything runs on Ubicloud runners.

| check | runs on | what it does |
|-------|---------|--------------|
| **PR Lint** | every PR; only checks the bot's PRs unless `PR_LINT_SCOPE=all` | exo's PR title and description rules |
| **Build** | repos with no PR CI of their own | install, lint, typecheck, test, build; bundles Worker previews |
| **Previews** | after Build, when it bundled any | deploys staging previews to `<app>-<branch>-pr.touchlessapis.com` |
| **Second Look (beta)** | only when someone asks | AI testers plus a context-aware reviewer; see [second-look](https://github.com/touchlesscode/second-look) |

A second ruleset, `review-required`, needs one human approval given after the last push, and blocks force-pushes and deleting the default branch. The Touchless Bot App has no bypass, so it can open PRs but never merge one alone.

In practice Build and Previews only run in repos with no CI of their own, which today means the bot's `touchlesscode/apps` monorepo and repos made from `app-template`. exo and anything else with a `pull_request` workflow are left out of the `bot-ci-build` ruleset, so they never see them.

## PR Lint

The title is `type(scope): description | EXO-1234`, or `| NO-TICKET`. The type is one of `feat fix docs style refactor test chore build ci perf`; the scope is optional.

The description needs three sections, each filled in (the template's placeholder text doesn't count):

```markdown
## Summary
What changed and why.

### Jira Ticket Reference
EXO-1234            (or a browse link, N/A, NO-TICKET)

### Test Plan
How a reviewer can check it by hand.
```

Dependabot, merge-queue and revert PRs are skipped. **Editing the title or body doesn't re-run it**, because rulesets ignore the `edited` event: push a commit, or close and reopen the PR.

## Build

First a light **Plan** job decides whether to run at all (`actions/ci/planChecks.ts`, from a checkout of just the CI config and `package.json`). It skips repos that already run a GitHub workflow on `pull_request` or use another CI system (Buildkite, CircleCI, GitLab, and so on), and repos with no root `package.json`; then the Build job doesn't start, which still passes. The job summary says why. Repos known to skip are left out of the ruleset altogether, so they don't even get Plan.

- **NX workspaces** get exo's pipeline: `nrwl/nx-set-shas` finds the base, then `nx affected -t build`, `lint`, `typecheck` and `test`, with the local NX cache and the pnpm store cached.
- **Other Node repos** install with a frozen lockfile, then run whichever of `lint`, a typecheck script (`typecheck`, `type-check`, `check-types` or `tsc`), `test` and `build` they declare.
- Node comes from `.nvmrc`, `.node-version` or `engines.node`, else 24.

### Packages: `@touchlesscode/*`

The install step gets the org secret `PACKAGES_READ_TOKEN` (a classic PAT with only `read:packages`), so private `@touchlesscode/*` packages install in any repo with no per-package setup. To keep that token away from PR code:

- pnpm and npm install with scripts off (`--ignore-scripts`, and `--ignore-pnpmfile` for pnpm); then `rebuild` and the root's install lifecycle scripts run in a later step, without the token.
- Before that, `npmrcGuard.ts` refuses any repo config that could send the token elsewhere or run code during install. A refusal names the setting. The usual causes:
  - an auth line or `${…}` in the repo's `.npmrc`; keep only `@touchlesscode:registry=https://npm.pkg.github.com` there and put auth in your own `~/.npmrc`;
  - an `@touchlesscode` registry other than `npm.pkg.github.com`;
  - `node-options`, `script-shell` or pnpmfile settings;
  - a `packageManager` that isn't a plain `name@version`.
- Yarn and bun installs don't get the token (their installs run repo code), so they only see packages that list the repo under the package's Actions access.

## Previews

An affected app gets a preview when its `wrangler.jsonc` has an `env.feature` section, exactly as exo does it. `app-template` ships this layout:

```jsonc
"env": {
  "feature": {
    "name": "my-app-${VERSION}",
    "routes": [{ "pattern": "my-app-${VERSION}.touchlessapis.com/*", "zone_name": "touchlessapis.com" }]
  }
}
```

- `VERSION` is exo's `getVersionFromBranch`: the last 20 characters of `<branch>-pr`, lowercased, with `.`, `/` and `_` turned into `-`.
- Secrets listed in the app's `package.json` under `config.exo.secrets` are pushed with `wrangler secret bulk`. Their values come from the repo's GitHub secrets with the same names. A listed secret that's missing fails that app's preview.
- The PR description gets the Preview Deployments table (🟢 deployed, 🔴 failed, ⚪ skipped) between its `deployment-links` markers, and a failed deploy also gets a comment.
- Dependabot and fork PRs don't deploy. Apps with no `env.feature`, or with a `wrangler.toml`, are listed as skipped.

**The PR's code never runs next to the Cloudflare token.** Build bundles each preview with `wrangler deploy --dry-run` and no token. Previews runs on a fresh runner, never checks out the PR, writes its own wrangler config and deploys the prebuilt bundle. Before that, `previewGuard.ts` refuses:

| refusal | fix |
|---------|-----|
| `env.feature.name must be <app>-<version>` | name the feature worker `<app>-${VERSION}` |
| `route "…" isn't <app>-<version>.touchlessapis.com` | give `env.feature` its own `routes` on that host; inherited top-level routes count too |
| `route "…" is a custom domain` | previews only take routes |
| `"…" is another env's worker` | the feature name can't match a production or other env's worker |
| an infra secret in `config.exo.secrets` | `CLOUDFLARE_*`, `SECOND_LOOK_*`, `GITHUB_*` and similar are never pushed to an app |

The guard doesn't check bindings: a feature env that binds a prod KV namespace, D1 database, R2 bucket, queue or service can reach prod data from the preview. Bind staging resources in `env.feature`.

**Reap Previews** runs nightly in this repo. Required workflows never see a PR close, so it deletes preview Workers (and their routes) that haven't been redeployed in `BOT_CI_PREVIEW_TTL_DAYS` (7). It only touches Workers named `*-pr` that carry the `BOT_CI_PREVIEW` binding Previews sets, so exo's own previews are never deleted. An open PR gets its preview back on its next push.

**Production deploys aren't wired.** Required workflows only run on PR events; deploying `main` needs a push-triggered workflow in the repo itself.

## Opting a repo out

Add your own `pull_request` workflow and Build and Previews skip the repo (and leave its required checks at the next `setup.sh` run). To leave a repo out of the rulesets entirely, an org owner adds it to the excludes (`setup.sh --exclude <repo>`).

## Settings

Org variables; none of them need a re-publish.

| variable | default | what |
|----------|---------|------|
| `BOT_CI_RUNNER`, `BOT_CI_LIGHT_RUNNER` | `ubicloud-standard-8`, `ubicloud-standard-2` | runners for Build and for the light jobs |
| `BOT_CI_PREVIEW_ZONE` | `touchlessapis.com` | the only zone previews may route on |
| `BOT_CI_PREVIEW_TTL_DAYS` | `7` | how old a preview gets before the reaper deletes it |
| `PR_LINT_SCOPE` | `bot` | `all` lints everyone's PRs |

Older `ORG_CI_*` names still work: this repo was `org-ci` until October 2026.

## Where this comes from

Published from `touchless-bot`'s `infra/bot-ci/` (and Second Look's code from `infra/second-look/`) after every merge to its main, as a sync PR from Touchless Bot that an org owner merges. Change things there, in a PR; edits made here are overwritten on the next publish. Rulesets and secrets are applied separately by an org owner with `infra/bot-ci/setup.sh`.

| path | what |
|------|------|
| `.github/workflows/pr-lint.yml`, `ci.yml` | the required workflows |
| `.github/workflows/reap-previews.yml` | the nightly reaper |
| `actions/pr-lint/` | PR Lint |
| `actions/ci/` | Build's planner, install guard and preview bundling, plus Previews' guard and deploy scripts |
| `actions/deploy-previews/` | the Previews job's action |
| `actions/previews/` | the reaper |
| `actions/second-look/`, `actions/second-look-agent/` | Second Look's steps, used by the private `second-look` repo |
