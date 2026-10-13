import { cliNameOf } from "./cliNameOf.ts"
import type { Family } from "./types.ts"

/** the small print under second look's inline comments and replies: what wrote it, and what the point rests on */
export const footnoteOf = ({ reviewer, source }: { reviewer: Family; source?: string }) =>
  `<sub>Second Look (beta) · reviewed via ${cliNameOf(reviewer)}${source && source !== "general judgement" ? ` · ${source}` : ""}</sub>`
