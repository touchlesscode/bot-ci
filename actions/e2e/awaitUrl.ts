import { setTimeout as sleepFor } from "node:timers/promises"

/**
 * polls `url` until it answers below 500 (a fresh Worker route can take a moment to win over a wildcard
 * one), or the deadline; returns whether it did, and the last answer
 */
export const awaitUrl = async ({ url, timeoutMs, intervalMs = 5_000, fetchImpl = fetch, sleep = (ms: number) => sleepFor(ms), now = () => Date.now() }: {
  url: string
  timeoutMs: number
  intervalMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<unknown>
  now?: () => number
}) => {
  const deadline = now() + timeoutMs
  let answered = "no answer yet"
  while (true) {
    try {
      const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) })
      answered = `HTTP ${response.status}`
      if (response.status < 500) return { ready: true, answered }
    } catch (error) {
      answered = `no answer (${(error as Error).message})`
    }
    if (now() + intervalMs > deadline) return { ready: false, answered }
    await sleep(intervalMs)
  }
}
