import type { Harness } from "./types.ts"

/** the harness that wrote the pr, from the `<!-- harness: claude -->` marker the bot puts in the body */
export const harnessOf = (body: string | null | undefined): Harness | undefined =>
  /<!--\s*harness:\s*(claude|codex)\s*-->/i.exec(body ?? "")?.[1]?.toLowerCase() as Harness | undefined
