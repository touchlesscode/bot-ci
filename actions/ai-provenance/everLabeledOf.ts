type IssueEvent = { event?: string; label?: { name?: string } }

/** whether a pr's issue events show `label` was ever added (removing it later doesn't switch beta scope off) */
export const everLabeledOf = (events: IssueEvent[], label: string) => events.some((event) => event.event === "labeled" && event.label?.name === label)
