/** a figma link: which file (a branch's key when it's on a branch) and, when given, which frame */
export type FigmaLink = { url: string; fileKey: string; nodeId?: string }

const maxLinks = 4
const linkPattern = /https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?[^\s)"'<>\]]*/g

/** the figma links in some text (a pr description, a ticket), deduped by file and frame */
export const figmaLinksOf = (...texts: string[]): FigmaLink[] => {
  const links = texts.flatMap((text) => [...text.matchAll(linkPattern)].map((match): FigmaLink => {
    const url = match[0].replace(/&amp;/g, "&")
    const nodeId = /[?&]node-id=([0-9]+[-:][0-9]+)/.exec(url)?.[1]?.replace("-", ":")
    return { url, fileKey: match[2] ?? match[1], ...(nodeId ? { nodeId } : {}) }
  }))
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.fileKey}#${link.nodeId ?? ""}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, maxLinks)
}
