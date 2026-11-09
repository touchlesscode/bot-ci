/** an adf node's plain text: text leaves joined, hard breaks as newlines */
export const adfTextOf = (node: unknown): string => {
  if (!node || typeof node !== "object") return ""
  const { type, text, content } = node as { type?: string; text?: string; content?: unknown[] }
  if (type === "text") return text ?? ""
  if (type === "hardBreak") return "\n"
  return (content ?? []).map(adfTextOf).join(type === "listItem" || type === "doc" ? "\n" : "")
}
