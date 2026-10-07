#!/usr/bin/env node
/**
 * second look, before the main reviewer: reads the pr's jira ticket(s) as the bot's jira user, and the figma
 * frames linked from the pr or ticket, into files the reviewer reads. the reviewer itself has no network and
 * never sees these tokens. never fails the job: a missing token or an unreadable ticket becomes a note.
 *
 *   node gatherContext.ts
 *
 * env: GITHUB_EVENT_PATH, SECOND_LOOK_JIRA_URL (default https://touchless.atlassian.net), SECOND_LOOK_JIRA_EMAIL,
 * SECOND_LOOK_JIRA_API_TOKEN, SECOND_LOOK_JIRA_PROJECTS (default EXO), SECOND_LOOK_FIGMA_TOKEN,
 * SECOND_LOOK_CONTEXT_DIRECTORY (default $RUNNER_TEMP/second-look-inputs/context). writes context.md there.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { figmaFramesOf, type FigmaFrame } from "./figmaFramesOf.ts"
import { figmaLinksOf } from "./figmaLinksOf.ts"
import { jiraTicketOf, type TicketContext } from "./jiraTicketOf.ts"
import { reviewContextOf } from "./reviewContextOf.ts"
import { ticketKeysOf } from "./ticketKeysOf.ts"
import type { PullRequest } from "./types.ts"

/** a GET with these headers that throws on a non-2xx */
const getterOf = (base: string, headers: Record<string, string>) => async (path: string) => {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`GET ${path.split("?")[0]} answered ${response.status}`)
  return response.json() as Promise<unknown>
}

const main = async () => {
  const directory = process.env.SECOND_LOOK_CONTEXT_DIRECTORY || join(process.env.RUNNER_TEMP ?? "/tmp", "second-look-inputs", "context")
  mkdirSync(directory, { recursive: true })
  const pull = (JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request: PullRequest }).pull_request
  const notes: string[] = []
  const keys = ticketKeysOf(pull, (process.env.SECOND_LOOK_JIRA_PROJECTS || "EXO").split(",").map((project) => project.trim()).filter(Boolean))

  const jiraEmail = process.env.SECOND_LOOK_JIRA_EMAIL || "bot@touchless.io"
  const jiraToken = process.env.SECOND_LOOK_JIRA_API_TOKEN ?? ""
  let tickets: TicketContext[] = []
  if (keys.length && !jiraToken) notes.push(`no Jira token (org secret SECOND_LOOK_JIRA_API_TOKEN), so ${keys.join(", ")} wasn't read`)
  if (keys.length && jiraToken) {
    const get = getterOf(process.env.SECOND_LOOK_JIRA_URL || "https://touchless.atlassian.net", { authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}` })
    const read = await Promise.all(keys.map((key) => jiraTicketOf({ get, key }).catch((error: Error) => `${key}: ${error.message}`)))
    tickets = read.filter((ticket): ticket is TicketContext => typeof ticket !== "string")
    notes.push(...read.filter((ticket): ticket is string => typeof ticket === "string").map((failure) => `couldn't read ${failure}`))
  }

  const links = figmaLinksOf(pull.body ?? "", ...tickets.map((ticket) => ticket.text))
  const figmaToken = process.env.SECOND_LOOK_FIGMA_TOKEN ?? ""
  let frames: FigmaFrame[] = links.map((link) => ({ url: link.url, name: "Figma link", note: "not read: no Figma token (org secret SECOND_LOOK_FIGMA_TOKEN)" }))
  if (links.length && figmaToken) frames = await figmaFramesOf({ get: getterOf("https://api.figma.com/v1", { "x-figma-token": figmaToken }), links, directory })

  const context = reviewContextOf({ keys, tickets, frames, notes })
  writeFileSync(join(directory, "context.md"), context)
  console.log(`second look context: tickets ${tickets.map((ticket) => ticket.key).join(", ") || "none"}; figma ${frames.filter((frame) => frame.imagePath).length}/${frames.length} frames${notes.length ? `; ${notes.join("; ")}` : ""}`)
}

if (import.meta.main) await main().catch((error: Error) => console.log(`::warning title=Second Look (beta)::couldn't gather the ticket context: ${error.message}`))
