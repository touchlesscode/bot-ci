import type { CheckRunLike } from "./betaScopeTypes.ts"

/** the slug of the app that made a check run, from github's `app` object or a flattened `app_slug`; undefined when neither is there */
export const appSlugOf = (run: Pick<CheckRunLike, "app" | "app_slug">) => run.app_slug ?? run.app?.slug ?? undefined
