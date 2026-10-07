/** the outermost json object in a model's final message, parsed; throws with a preview when there isn't one */
export const jsonObjectOf = (text: string): Record<string, unknown> => {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) throw new Error(`no json object in the reply: ${text.trim().slice(0, 200) || "(empty)"}`)
  const parsed = JSON.parse(json) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("the reply's json isn't an object")
  return parsed as Record<string, unknown>
}
