const secretShaped = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i

/**
 * the environment an agent cli (and so every command it runs) starts with:
 * the runner's, minus anything shaped like a secret, plus `extra`
 * (CODEX_HOME and the like, set after the scrub).
 */
export const childEnvironmentOf = (environment: NodeJS.ProcessEnv, extra: Record<string, string> = {}): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined && !secretShaped.test(entry[0]))),
  ...extra,
})
