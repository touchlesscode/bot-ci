import type { E2ePreview } from "./types.ts"

const safeRoot = /^(?:\.|[\w@.-]+(?:\/[\w@.-]+)*)$/

/**
 * the previews job's `urls` output (JSON) as previews to test. only https urls and repo-relative roots with
 * no `..` survive; anything unreadable is an empty list, never a throw
 */
export const e2ePreviewsOf = (text: string | undefined): E2ePreview[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text || "[]")
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry): E2ePreview[] => {
    const { label, root, url } = (entry ?? {}) as Record<string, unknown>
    if (typeof label !== "string" || typeof root !== "string" || typeof url !== "string") return []
    if (!safeRoot.test(root) || root.split("/").includes("..")) return []
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/\S*)?$/i.test(url)) return []
    return [{ label: label.replace(/[^\w.-]/g, "-").slice(0, 60) || "app", root, url }]
  })
}
