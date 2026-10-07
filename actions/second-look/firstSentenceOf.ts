/**
 * the first sentence of `text`: up to the first `.`, `!` or `?` followed by whitespace, skipping ones
 * inside a code span and an ellipsis (`...`), so "wraps `(function(){ try{ ... }` in…" isn't cut mid-code
 */
export const firstSentenceOf = (text: string) => {
  let inCode = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === "`") inCode = !inCode
    else if (!inCode && /[.!?]/.test(character) && /\s/.test(text[index + 1] ?? "") && text[index - 1] !== "." && index > 0) return text.slice(0, index + 1)
  }
  return text
}
