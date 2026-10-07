import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { FigmaLink } from "./figmaLinksOf.ts"

/** a linked figma frame as the reviewer gets it: its name, and a png of it when the link names a frame */
export type FigmaFrame = { url: string; name: string; imagePath?: string; note?: string }

/** GET a figma rest path (api.figma.com/v1) with the figma token; throws on a non-2xx */
export type FigmaGet = (path: string) => Promise<unknown>

const maxImageBytes = 8_000_000

/** a png from figma's image cdn (a signed url: no token sent) */
const downloadImage = async (url: string, path: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`the image answered ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > maxImageBytes) throw new Error("the image is over 8 MB")
  writeFileSync(path, bytes)
}

/** each link's frame name and, for links to a frame, a png in `directory`; a failure becomes a note */
export const figmaFramesOf = async ({ get, links, directory, fetchImpl = fetch }: { get: FigmaGet; links: FigmaLink[]; directory: string; fetchImpl?: typeof fetch }) =>
  Promise.all(links.map(async (link, index): Promise<FigmaFrame> => {
    try {
      if (!link.nodeId) {
        const file = (await get(`/files/${link.fileKey}?depth=1`)) as { name?: string; document?: { children?: { name?: string }[] } }
        return { url: link.url, name: `${file.name ?? "Figma file"} (pages: ${(file.document?.children ?? []).map((page) => page.name).filter(Boolean).join(", ") || "none"})`, note: "no frame in the link, so no image" }
      }
      const ids = encodeURIComponent(link.nodeId)
      const [nodes, images] = (await Promise.all([get(`/files/${link.fileKey}/nodes?ids=${ids}&depth=1`), get(`/images/${link.fileKey}?ids=${ids}&format=png&scale=1`)])) as [
        { name?: string; nodes?: Record<string, { document?: { name?: string } } | null> },
        { images?: Record<string, string | null> },
      ]
      const name = `${nodes.name ?? "Figma"} › ${nodes.nodes?.[link.nodeId]?.document?.name ?? link.nodeId}`
      const imageUrl = images.images?.[link.nodeId]
      if (!imageUrl) return { url: link.url, name, note: "figma rendered no image for this frame" }
      const imagePath = join(directory, `figma-${index + 1}.png`)
      await downloadImage(imageUrl, imagePath, fetchImpl)
      return { url: link.url, name, imagePath }
    } catch (error) {
      return { url: link.url, name: "Figma link", note: `couldn't read it: ${(error as Error).message}` }
    }
  }))
