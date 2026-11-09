import type { FigmaFrame } from "./figmaFramesOf.ts"
import type { TicketContext } from "./jiraTicketOf.ts"

/** a ticket's acceptance criteria as numbered lines (`EXO-1234 AC1: …`), or a line saying it has none */
const acceptanceLinesOf = ({ key, acceptance }: TicketContext) =>
  acceptance.length ? acceptance.map((criterion, index) => `- ${key} AC${index + 1}: ${criterion}`) : [`- ${key}: no acceptance criteria in the ticket (no "Acceptance criteria" list, no Given/When/Then lines)`]

/** the context section of the reviewer's prompt: the tickets, their acceptance criteria, the linked designs, and what couldn't be read */
export const reviewContextOf = ({ keys, tickets, frames, notes }: { keys: string[]; tickets: TicketContext[]; frames: FigmaFrame[]; notes: string[] }) =>
  [
    "## Ticket",
    "",
    keys.length ? (tickets.length ? tickets.map((ticket) => ticket.markdown).join("\n\n") : `${keys.join(", ")}: couldn't be read (see notes).`) : "No Jira ticket on this PR (NO-TICKET, or none referenced). Judge its intent from the description.",
    ...(tickets.length ? ["", "## Acceptance criteria", "", ...tickets.flatMap(acceptanceLinesOf)] : []),
    ...(frames.length ? ["", "## Designs linked from the PR or ticket", "", ...frames.map((frame) => `- ${frame.name}: ${frame.url}${frame.imagePath ? `\n  image: ${frame.imagePath} (open it)` : ""}${frame.note ? `\n  (${frame.note})` : ""}`)] : []),
    ...(notes.length ? ["", "## Context notes", "", ...notes.map((note) => `- ${note}`)] : []),
  ].join("\n")
