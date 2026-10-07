/** one deployed preview of the pr: which app, and where */
export type PreviewLink = { label: string; url: string }

const linksStart = "<!-- deployment-links:start -->"
const linksEnd = "<!-- deployment-links:end -->"
const hrefPattern = /href="(https?:\/\/[^"\s]+)"|\]\((https?:\/\/[^)\s]+)\)/
const labelPattern = /<strong>([^<]+)<\/strong>|\*\*([^*]+)\*\*/

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/**
 * the previews listed in a pr description's deployment-links block, which exo's own preview job and
 * bot-ci's Previews both write: one table row (or line) per app, with its url when the deploy worked.
 */
export const previewLinksOf = (body: string | null | undefined): PreviewLink[] => {
  const text = body ?? ""
  const from = text.indexOf(linksStart)
  const to = from === -1 ? -1 : text.indexOf(linksEnd, from)
  if (to === -1) return []
  const block = text.slice(from + linksStart.length, to)
  const rows = block.includes("<tr") ? block.split(/<tr[\s>]/).slice(1) : block.split("\n")
  return rows.flatMap((row) => {
    const href = hrefPattern.exec(row)
    if (!href) return []
    const label = labelPattern.exec(row)
    return [{ label: textOf(label?.[1] ?? label?.[2] ?? "") || "preview", url: href[1] ?? href[2] }]
  })
}
