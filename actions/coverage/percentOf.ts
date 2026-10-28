import type { Tally } from "./types.ts"

/** a tally as a percentage with up to two decimals, rounded down so 99.996% never shows as 100%; nothing found is 100 */
export const percentOf = ({ found, hit }: Tally) => (found ? Math.floor((hit / found) * 10_000) / 100 : 100)
