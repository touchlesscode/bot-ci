/**
 * the json shapes the two clis must answer in (`claude --json-schema`,
 * `codex exec --output-schema`). strict-mode compatible: every property is
 * required and nothing extra is allowed, nullable fields are `[type, "null"]`.
 */
const strictObject = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties })
const strings = { type: "array", items: { type: "string" } }
const nullableString = { type: ["string", "null"] }
const nullableLine = { type: ["integer", "null"] }

export const reportSchema = strictObject({
  summary: { type: "string" },
  confidence: { type: "string", enum: ["high", "medium", "low"] },
  replicated: {
    type: "array",
    items: strictObject({ step: { type: "string" }, command: { type: "string" }, result: { type: "string", enum: ["pass", "fail", "couldnt"] }, note: { type: "string" } }),
  },
  concerns: { type: "array", items: strictObject({ file: nullableString, line: nullableLine, note: { type: "string" } }) },
})

export const verdictSchema = strictObject({
  verdict: { type: "string", enum: ["pass", "block"] },
  summary: { type: "string" },
  intent: strings,
  intendedArchitecture: strings,
  tested: strings,
  disagreements: strings,
  findings: {
    type: "array",
    items: strictObject({ file: nullableString, line: nullableLine, severity: { type: "string", enum: ["block", "warn"] }, note: { type: "string" }, source: { type: "string" } }),
  },
})
