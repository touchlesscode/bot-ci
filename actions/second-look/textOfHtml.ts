const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " }

/** jira's rendered html as plain text: block tags become line breaks, list items "- ", links keep their url */
export const textOfHtml = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => (text.replace(/<[^>]+>/g, "").trim() === href ? href : `${text} (${href})`))
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/pre|\/ul|\/ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] ?? entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}- /g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
