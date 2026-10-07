import type { Family } from "./types.ts"

export type Role = "tester" | "reviewer"

export type CliCommand = { command: string; args: string[] }

export const defaultModels: Record<Family, string> = { anthropic: "claude-opus-5-5", openai: "gpt-6-sol" }

const testerTools = ["Bash", "Read", "Grep", "Glob", "Edit", "Write"]
const reviewerTools = ["Read", "Grep", "Glob"]
const secretShapes = ["*KEY*", "*TOKEN*", "*SECRET*"]

/**
 * how to run one agent headless, prompt on stdin.
 *
 * claude code: `--bare` skips hooks and settings a pr could plant, and the
 * key comes from an `apiKeyHelper` file rather than the environment the
 * agent's commands inherit. the reviewer is `--restricted` with read-only
 * tools, confined to the checkout plus `filesDirectory`.
 *
 * codex: logged in through `CODEX_HOME`, so no key in the environment; the
 * tester's shell drops anything shaped like a secret and gets network (installs)
 * plus `$HOME` (package caches) as writable roots; the reviewer is read-only.
 * `codexSandbox` overrides the tester's sandbox for runners where codex's
 * linux sandbox can't start (`danger-full-access`: the vm is the sandbox).
 */
export const cliCommandOf = ({ family, role, model, filesDirectory, schemaText, schemaPath, outputPath, budgetUsd, keyFile, home, codexSandbox }: {
  family: Family
  role: Role
  model: string
  filesDirectory: string
  schemaText: string
  schemaPath: string
  outputPath: string
  budgetUsd: number
  keyFile: string
  home: string
  codexSandbox?: string
}): CliCommand => {
  if (family === "anthropic") return {
    command: "claude",
    args: [
      "-p",
      "--bare",
      ...(role === "reviewer" ? ["--restricted"] : []),
      "--allowedTools", ...(role === "tester" ? testerTools : reviewerTools),
      "--permission-mode", "dontAsk",
      "--add-dir", filesDirectory,
      "--model", model,
      "--output-format", "json",
      "--json-schema", schemaText,
      "--max-budget-usd", String(budgetUsd),
      "--no-session-persistence",
      "--settings", JSON.stringify({ apiKeyHelper: `cat '${keyFile}'` }),
    ],
  }
  return {
    command: "codex",
    args: [
      "exec",
      "--sandbox", role === "tester" ? (codexSandbox === "danger-full-access" ? "danger-full-access" : "workspace-write") : "read-only",
      ...(role === "tester" && codexSandbox !== "danger-full-access" ? ["-c", "sandbox_workspace_write.network_access=true", "--add-dir", home, "--add-dir", filesDirectory] : []),
      "-c", `shell_environment_policy.exclude=${JSON.stringify(secretShapes)}`,
      "--model", model,
      "--output-schema", schemaPath,
      "--output-last-message", outputPath,
      "--skip-git-repo-check",
      "--ephemeral",
      "--color", "never",
      "-",
    ],
  }
}
