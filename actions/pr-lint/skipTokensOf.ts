/**
 * title tokens that make exo's `cicd` workflow skip its own checks (exo `.github/workflows/cicd.yml`): `[skip-checks]`
 * skips the quality checks (nx affected build/lint/test), `[skip e2e]` skips every e2e suite. github's `contains()`
 * ignores case, so this does too. the draft `[e2e]` opt-in only adds checks and isn't one
 */
const skipTokens = ["[skip-checks]", "[skip e2e]"]

/** the exo skip tokens in a pr title, as written in exo's workflow; empty when it has none */
export const skipTokensOf = (title: string) => skipTokens.filter((token) => title.toLowerCase().includes(token))
