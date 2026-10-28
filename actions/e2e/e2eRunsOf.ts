import { join } from "node:path"
import type { E2ePreview, E2eRun, E2eSkip } from "./types.ts"

const e2eScript = "test:e2e"

/**
 * a Playwright run per preview whose app declares `test:e2e` in its own package.json (`<package manager>
 * run test:e2e` in the app's directory, PREVIEW_URL set to its preview); the rest are skipped with a reason
 */
export const e2eRunsOf = ({ previews, packageManager, readText }: { previews: E2ePreview[]; packageManager: string; readText: (path: string) => string | undefined }) =>
  previews.reduce<{ runs: E2eRun[]; skipped: E2eSkip[] }>((result, preview) => {
    const text = readText(join(preview.root, "package.json"))
    let scripts: Record<string, string> = {}
    try {
      scripts = (JSON.parse(text ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {}
    } catch {
      return { ...result, skipped: [...result.skipped, { label: preview.label, reason: `${join(preview.root, "package.json")} doesn't parse` }] }
    }
    if (!scripts[e2eScript]) return { ...result, skipped: [...result.skipped, { label: preview.label, reason: `${join(preview.root, "package.json")} has no ${e2eScript} script` }] }
    return { ...result, runs: [...result.runs, { label: preview.label, cwd: preview.root, url: preview.url, command: [packageManager, "run", e2eScript] }] }
  }, { runs: [], skipped: [] })
