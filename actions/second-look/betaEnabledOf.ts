/**
 * whether this run is for a beta-enabled pr: the relay dispatches those with the workflow input `beta-enabled: true`,
 * which reaches the steps as SECOND_LOOK_BETA_ENABLED. only the exact word `true` counts; anything else, blank
 * included, is a normal run that never approves
 */
export const betaEnabledOf = (value: string | undefined) => value?.trim().toLowerCase() === "true"
