/**
 * second look's spend and outage switches, in one place. each is an org variable when the workflow passes it through
 * (SECOND_LOOK_* below, read by planSettingsOf in reviewPlanOf.ts and by synthesize.ts); until then, or when the variable
 * is blank, these defaults apply. turning one off: set its variable to `off`, or flip it here and let the sync PR ship it.
 * README "Settings" (infra/bot-ci/second-look-repo/README.md) lists them for people.
 */
export const spendSettings = {
  /** SECOND_LOOK_SKIP_REPOS: repos whose prs get no model review (test traffic); `none` for none */
  skipRepos: ["bot-e2e-sandbox"],
  /** SECOND_LOOK_SKIP_DOCS_ONLY: a pr that only changes docs/ or READMEs gets no model review */
  skipDocsOnly: true,
  /** SECOND_LOOK_INCREMENTAL: a re-review looks at the changes since the last reviewed head, testers only when runnable code changed */
  incremental: true,
  /** SECOND_LOOK_TIERED_MODEL: a small, low-risk diff gets `smallModel` instead of the configured anthropic model */
  tieredModel: true,
  /** SECOND_LOOK_SMALL_MODEL */
  smallModel: "claude-sonnet-5-5",
  /** SECOND_LOOK_SMALL_MAX_LINES: ~400 changed lines is where review quality is known to drop off, so past it the larger model reviews */
  smallMaxLines: 400,
  /** SECOND_LOOK_OUTAGE_RED: a provider refusing on credit, quota or its key closes the check red and fails the run */
  outageRed: true,
} as const

/** a variable that turns its switch off */
export const isOff = (value: string | undefined) => /^(off|false|0|no|none)$/i.test((value ?? "").trim())

/** a variable that turns its switch on */
export const isOn = (value: string | undefined) => /^(on|true|1|yes)$/i.test((value ?? "").trim())

/** a switch: the variable when it says on or off, the default otherwise */
export const switchOf = (value: string | undefined, fallback: boolean) => (isOff(value) ? false : isOn(value) ? true : fallback)
