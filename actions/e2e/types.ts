/** a deployed preview, as the previews job hands it to the E2E job: the app's label, its directory in the repo and its url */
export type E2ePreview = { label: string; root: string; url: string }

/** one Playwright run: in the app's directory, against its preview */
export type E2eRun = { label: string; cwd: string; url: string; command: string[] }

/** a preview the E2E job won't test, and why */
export type E2eSkip = { label: string; reason: string }
