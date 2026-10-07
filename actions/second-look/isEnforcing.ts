/** `enforce` fails the check on a block verdict or a review error; anything else (the default while it's in beta) only advises */
export const isEnforcing = (mode: string | undefined) => mode?.trim().toLowerCase() === "enforce"
