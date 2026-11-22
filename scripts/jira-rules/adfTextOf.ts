/** an adf node's plain text: text leaves joined, hard breaks, blocks and list items on lines of their own */
export const adfTextOf = (node: unknown): string => {
  if (!node || typeof node !== "object") return ""
  const { type, text, content } = node as { type?: string; text?: string; content?: unknown[] }
  if (type === "text") return text ?? ""
  if (type === "hardBreak") return "\n"
  return (content ?? []).map(adfTextOf).join(["doc", "listItem", "bulletList", "orderedList", "blockquote"].includes(type ?? "") ? "\n" : "")
}
