import { adfTextOf } from "./adfTextOf.ts"

/**
 * "Acceptance criteria", or a lead-in of one to three words joined to it on a line of its own: "Scope / acceptance
 * criteria", "Scope & acceptance criteria", "Scope and acceptance criteria". prose that mentions acceptance criteria
 * ("Discuss design and acceptance criteria with PM") isn't a heading
 */
const heading = /^\s*(#+\s*|\*\*)?(?:acceptance criteria\b|[a-z]+(?: [a-z]+){0,2}\s*(?:\/|&|\band\b)\s*acceptance criteria\s*(?:\*\*)?\s*:?\s*(?:\*\*)?\s*$)/i
const gherkin = /^\s*[-*•]?\s*(given|when|then|and)\b/i
const starts = (word: string) => new RegExp(`^\\s*[-*•]?\\s*${word}\\b`, "i")

/** given/when/then lines, only when they form a scenario: from a Given line through its Then (prose that starts with "When" isn't a criterion) */
const scenarioOf = (text: string) => {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => starts("given").test(line))
  if (start < 0) return []
  const run: string[] = []
  for (const line of lines.slice(start)) {
    if (!line.trim()) continue
    if (!gherkin.test(line)) break
    run.push(line)
  }
  return run.some((line) => starts("then").test(line)) ? run : []
}

/** Criteria in canonical ADF lists or the per-line bullet paragraphs effort-intake's Push writes. */
const adfListOf = (doc: { content?: unknown[] }) => {
  const blocks = (doc.content ?? []) as { type?: string; content?: unknown[] }[]
  const start = blocks.findIndex((block) => (block.type === "heading" || block.type === "paragraph") && heading.test(adfTextOf(block)))
  if (start < 0) return []
  const items: string[] = []
  for (const block of blocks.slice(start + 1)) {
    if (block.type === "heading") break
    if (block.type === "bulletList" || block.type === "orderedList") items.push(...(block.content ?? []).map(adfTextOf))
    else {
      const text = adfTextOf(block)
      const bullet = block.type === "paragraph" ? text.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/) : undefined
      if (bullet) items.push(bullet[1]!)
      else if (items.length || text.trim()) break
    }
  }
  return items
}

/** the "- " bullets under an "Acceptance criteria" line in plain text or markdown */
const textListOf = (text: string) => {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return []
  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (bullet) items.push(bullet[1])
    else if (line.trim() && items.length) break
  }
  return items
}

/**
 * a ticket's acceptance criteria from its description (adf from jira, or plain text): the list under an
 * "Acceptance criteria" heading, else its Given/When/Then lines. empty when it has none. one parser for the
 * whole factory: effort-sync (what the loop may build) and Second Look (what the PR must prove)
 */
export const acceptanceOf = (description: unknown): string[] => {
  const listed = typeof description === "string" ? textListOf(description) : description && typeof description === "object" ? adfListOf(description as { content?: unknown[] }) : []
  const text = typeof description === "string" ? description : adfTextOf(description)
  const items = listed.length ? listed : scenarioOf(text)
  return items.map((item) => item.replace(/^\s*[-*•]\s*/, "").replace(/^\s*\[[ xX]\]\s*/, "").trim()).filter(Boolean)
}
