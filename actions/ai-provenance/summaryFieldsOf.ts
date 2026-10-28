/** `key: value` lines of a check run summary as a record (keys lowercased, first value wins) */
export const summaryFieldsOf = (summary: string | null | undefined) => {
  const fields: Record<string, string> = {}
  for (const line of (summary ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z][a-z-]*)\s*:\s*(.+?)\s*$/i)
    if (match && !(match[1].toLowerCase() in fields)) fields[match[1].toLowerCase()] = match[2]
  }
  return fields
}
