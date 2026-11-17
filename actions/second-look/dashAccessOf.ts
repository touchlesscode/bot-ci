import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { cookieJarOf } from "./cookieJarOf.ts"
import type { DashSession } from "./dashSignIn.ts"
import { openedOf } from "./openedOf.ts"
import { signedInPageOf } from "./signedInPageOf.ts"

/**
 * what the tester's harness made of prepare's dash session. signed in: the preview, as whom, a Playwright storage
 * state and a curl cookie jar (0600 files) and the values to redact and mask; otherwise why not. `line` is the
 * report's sign-in line, which never holds a cookie.
 */
export type DashAccess =
  | { signedIn: true; origin: string; identity: string; statePath: string; jarPath: string; secrets: string[]; line: string }
  | { signedIn: false; line: string }

/**
 * opens the sealed session (SECOND_LOOK_DASH_SESSION) with the transport key, writes it where the agent can load it
 * (`directory`), and checks it still reaches a signed-in page before the agent starts. `note` is prepare's sign-in
 * note, the reason when there's no session.
 */
export const dashAccessOf = async ({ sealed, transportKey, note, directory, fetch = globalThis.fetch }: {
  sealed: string | undefined
  transportKey: string | undefined
  note: string | undefined
  directory: string
  fetch?: typeof globalThis.fetch
}): Promise<DashAccess> => {
  if (!sealed) return { signedIn: false, line: `Not signed in to Dash: ${note || "no Dash sign-in for this run"}.` }
  let session: DashSession
  try {
    session = JSON.parse(openedOf(sealed, transportKey ?? "")) as DashSession
  } catch {
    return { signedIn: false, line: "Not signed in to Dash: the sealed session didn't open (transport key mismatch?)." }
  }
  const secrets = session.cookies.map((cookie) => cookie.value)
  const page = await signedInPageOf({ fetch, origin: session.origin, cookies: session.cookies })
  if (!page.ok) return { signedIn: false, line: `Not signed in to Dash: ${page.note}.` }
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const statePath = join(directory, "dash-storage-state.json")
  const jarPath = join(directory, "dash-cookies.txt")
  writeFileSync(statePath, JSON.stringify({ cookies: session.cookies, origins: [] }), { mode: 0o600 })
  writeFileSync(jarPath, cookieJarOf(session.cookies), { mode: 0o600 })
  return { signedIn: true, origin: session.origin, identity: session.identity, statePath, jarPath, secrets, line: `Signed in to ${session.origin} as ${session.identity} (read-only).` }
}
