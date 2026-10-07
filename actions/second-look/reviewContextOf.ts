import type { FigmaFrame } from "./figmaFramesOf.ts"
import type { TicketContext } from "./jiraTicketOf.ts"

/** the context section of the reviewer's prompt: the tickets, the linked designs, and what couldn't be read */
export const reviewContextOf = ({ keys, tickets, frames, notes }: { keys: string[]; tickets: TicketContext[]; frames: FigmaFrame[]; notes: string[] }) =>
  [
    "## Ticket",
    "",
    keys.length ? (tickets.length ? tickets.map((ticket) => ticket.markdown).join("\n\n") : `${keys.join(", ")}: couldn't be read (see notes).`) : "No Jira ticket on this PR (NO-TICKET, or none referenced). Judge its intent from the description.",
    ...(frames.length ? ["", "## Designs linked from the PR or ticket", "", ...frames.map((frame) => `- ${frame.name}: ${frame.url}${frame.imagePath ? `\n  image: ${frame.imagePath} (open it)` : ""}${frame.note ? `\n  (${frame.note})` : ""}`)] : []),
    ...(notes.length ? ["", "## Context notes", "", ...notes.map((note) => `- ${note}`)] : []),
  ].join("\n")
