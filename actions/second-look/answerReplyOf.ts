import { cliNameOf } from "./cliNameOf.ts"
import type { Question } from "./questionOf.ts"
import type { Family } from "./types.ts"

/** marks second look's answers to people's questions */
export const answerMarker = "<!-- touchless-second-look-answer -->"

const maxQuoteChars = 200

/** the question's first line without the @mention, for the quote above a conversation answer */
const quoteOf = (body: string) => {
  const line = body.replace(/^(\s*>.*\n)+/, "").replace(/@(clanker-in-chief|touchless-bot)\b[\s,:]*/gi, "").trim().split("\n")[0] ?? ""
  return line.length > maxQuoteChars ? `${line.slice(0, maxQuoteChars)}…` : line
}

/** the answer as posted: in a thread just the answer, in the conversation quoting the question and mentioning who asked */
export const answerReplyOf = ({ answer, question, reviewer }: { answer: string; question: Question; reviewer: Family }) => {
  const footnote = `<sub>Second Look (beta) · answered via ${cliNameOf(reviewer)}</sub>`
  if (question.kind === "review") return `${answerMarker}\n${answer.trim()}\n\n${footnote}`
  const quote = quoteOf(question.body)
  return `${answerMarker}\n${quote ? `> ${quote}\n\n` : ""}@${question.author} ${answer.trim()}\n\n${footnote}`
}

/** what's posted when no answer came back, so the 👀 isn't the last word */
export const noAnswerReplyOf = ({ question, reason }: { question: Question; reason: string }) =>
  `${answerMarker}\n${question.kind === "issue" ? `@${question.author} ` : ""}I couldn't answer that just now (${reason}). Ask again in a few minutes.`
