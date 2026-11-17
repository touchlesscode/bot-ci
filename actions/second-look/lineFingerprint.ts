import { createHash } from "node:crypto"

const markerPattern = /<!-- touchless-second-look-line:([0-9a-f]{12}) -->/g

/** a short hash of the code around `line` (two lines either side, trimmed) in a file's `text`: what a reply was about */
export const lineFingerprintOf = (text: string, line: number) =>
  createHash("sha256").update(text.split("\n").slice(Math.max(0, line - 3), line + 2).map((row) => row.trim()).join("\n")).digest("hex").slice(0, 12)

/** the fingerprint as a hidden line for a reply */
export const fingerprintMarkerOf = (fingerprint: string) => `<!-- touchless-second-look-line:${fingerprint} -->`

/** the last fingerprint in a reply's `body`, or undefined when it has none (a reply from before fingerprints) */
export const fingerprintIn = (body: string) => [...body.matchAll(markerPattern)].at(-1)?.[1]
