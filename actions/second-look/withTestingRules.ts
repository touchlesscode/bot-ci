import { existsSync, readFileSync } from "node:fs"

/**
 * the rules the reviewer gets: the repo's (or the default template's, rulesOf.ts), then the org's testing
 * rules, which apply on every repo whatever its own rules say. no testing rules file leaves the rules as they are
 */
export const withTestingRules = (rules: string, testingRulesPath: string | undefined, read: (path: string) => string | undefined = (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined)) => {
  const testing = testingRulesPath ? read(testingRulesPath)?.trim() : undefined
  return testing ? `${rules.trim()}\n\n${testing}` : rules
}
