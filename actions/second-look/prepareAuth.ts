import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Family } from "./types.ts"

/**
 * puts the model key where the cli reads it instead of in the environment the
 * agent's commands inherit: a 0600 file behind claude's `apiKeyHelper`, or a
 * `codex login --with-api-key` into a private CODEX_HOME. returns the key file
 * and the variables the cli needs on top of the scrubbed environment.
 */
export const prepareAuth = ({ family, key, directory }: { family: Family; key: string; directory: string }) => {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const keyFile = join(directory, `${family}.key`)
  if (family === "anthropic") {
    writeFileSync(keyFile, key, { mode: 0o600 })
    return { keyFile, extraEnvironment: {} }
  }
  const codexHome = join(directory, "codex-home")
  mkdirSync(codexHome, { recursive: true, mode: 0o700 })
  execFileSync("codex", ["login", "--with-api-key"], { input: key, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CODEX_HOME: codexHome }, stdio: ["pipe", "ignore", "inherit"] })
  return { keyFile, extraEnvironment: { CODEX_HOME: codexHome } }
}
