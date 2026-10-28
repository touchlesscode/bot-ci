import { execFileSync } from "node:child_process"
import { flatSecretsOf } from "./flatSecretsOf.ts"

type Run = (command: string, args: string[], options: { encoding: "utf8"; env: NodeJS.ProcessEnv; stdio: ["ignore", "pipe", "pipe"]; maxBuffer: number }) => string

/**
 * the secrets in a sops + age encrypted file, decrypted in memory: `sops` gets the age key in its own env
 * (SOPS_AGE_KEY) and nothing else, and its stdout comes back here, never to a file or the log
 */
export const sopsSecretsOf = ({ sops, file, ageKey, run = execFileSync as unknown as Run }: { sops: string; file: string; ageKey: string; run?: Run }) => {
  const output = run(sops, ["--decrypt", "--output-type", "json", file], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", SOPS_AGE_KEY: ageKey }, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 })
  return flatSecretsOf(JSON.parse(output))
}
