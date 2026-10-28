type ProvenanceEvent = { pull_request?: { number?: number }; check_run?: { pull_requests?: { number?: number }[] } }

/** the pr numbers an event is about: the pr itself, or the prs a completed check run is attached to; none in the merge queue */
export const pullNumbersOf = (eventName: string, event: ProvenanceEvent) => {
  if ((eventName === "pull_request" || eventName === "pull_request_target" || eventName === "pull_request_review") && event.pull_request?.number) return [event.pull_request.number]
  if (eventName === "check_run") return [...new Set((event.check_run?.pull_requests ?? []).map((pull) => pull.number).filter((number): number is number => Number.isInteger(number)))]
  return []
}
