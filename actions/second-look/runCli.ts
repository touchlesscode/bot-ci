import { spawn } from "node:child_process"

export type CliResult = { code: number | null; stdout: string; timedOut: boolean }

const maxStdoutChars = 4 * 1024 * 1024

/**
 * runs a cli with `input` on stdin, streaming its stderr to the job log and
 * keeping its stdout (capped). kills it after `timeoutMs`; never rejects for a
 * non-zero exit, only when it can't start.
 */
export const runCli = ({ command, args, cwd, environment, input, timeoutMs }: {
  command: string
  args: string[]
  cwd: string
  environment: Record<string, string>
  input: string
  timeoutMs: number
}) => new Promise<CliResult>((resolve, reject) => {
  const child = spawn(command, args, { cwd, env: environment, stdio: ["pipe", "pipe", "pipe"] })
  let stdout = ""
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill("SIGTERM")
    setTimeout(() => child.kill("SIGKILL"), 10_000).unref()
  }, timeoutMs)
  child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < maxStdoutChars) stdout += chunk.toString("utf8") })
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  child.on("error", (error) => { clearTimeout(timer); reject(error) })
  child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, timedOut }) })
  child.stdin.end(input)
})
