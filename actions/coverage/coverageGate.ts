#!/usr/bin/env node
/**
 * bot-ci's coverage gate, after Build's checks (the `coverage` check ran `test:coverage`, which writes
 * `<project>/coverage/lcov.info`). it reads every report itself, so it doesn't depend on the thresholds a PR
 * could lower in its own vitest config:
 *
 * - `full` (a repo of its own made from app-template): lines, branches and functions at 100%
 * - `patch` (a shared repo: `apps`, or a repo outside Build running this from its own workflow): every
 *   line the PR adds or edits that a report instruments has run, branches included
 *
 * BOT_CI_COVERAGE decides what a miss does: `evaluate` (the default) warns and writes the job summary,
 * `enforce` fails the step, `off` skips it.
 *
 *   node coverageGate.ts   (cwd = the checked-out repo, after the tests ran with coverage)
 *
 * env: GITHUB_REPOSITORY, BOT_CI_COVERAGE, BOT_CI_COVERAGE_MODE (full | patch | auto), BOT_CI_PATCH_COVERAGE_REPOS,
 * BOT_CI_COVERAGE_BASE (the PR's base sha; changed lines are base...HEAD), GITHUB_STEP_SUMMARY, GITHUB_OUTPUT.
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { addedLinesOf } from "./addedLinesOf.ts"
import { coverageEnforcementOf } from "./coverageEnforcementOf.ts"
import { coverageModeOf } from "./coverageModeOf.ts"
import { coverageVerdictOf } from "./coverageVerdictOf.ts"
import { lcovFilesOf } from "./lcovFilesOf.ts"
import { lcovReportsIn } from "./lcovReportsIn.ts"
import { repoPathOf } from "./repoPathOf.ts"
import type { ChangedLines, FileCoverage } from "./types.ts"

/** the lines base...HEAD adds or edits; empty, with a warning, when there's no base to diff against */
const changedSince = (base: string | undefined): ChangedLines => {
  if (!base || /^0+$/.test(base)) {
    console.log("::warning title=Coverage::no base commit to diff against, so no changed lines were measured")
    return {}
  }
  const diff = execFileSync("git", ["diff", "--no-color", "--no-ext-diff", "--unified=0", "--no-renames", `${base}...HEAD`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  return addedLinesOf(diff)
}

const main = () => {
  const enforcement = coverageEnforcementOf(process.env.BOT_CI_COVERAGE)
  if (enforcement === "off") return console.log("coverage: BOT_CI_COVERAGE=off, skipping")
  const repoRoot = process.cwd()
  const repository = process.env.GITHUB_REPOSITORY ?? ""
  const mode = coverageModeOf({ repository, requested: process.env.BOT_CI_COVERAGE_MODE, patchRepos: process.env.BOT_CI_PATCH_COVERAGE_REPOS })
  const reports = lcovReportsIn(repoRoot)
  const files = reports.flatMap((reportPath): FileCoverage[] =>
    lcovFilesOf(readFileSync(join(repoRoot, reportPath), "utf8")).flatMap((file) => {
      const path = repoPathOf({ sourcePath: file.path, reportPath, repoRoot })
      return path ? [{ ...file, path }] : []
    }))
  const verdict = coverageVerdictOf({ mode, files, changed: changedSince(process.env.BOT_CI_COVERAGE_BASE), reports: reports.length })
  console.log([`coverage: ${mode} mode, ${enforcement}, ${reports.length} report(s): ${reports.join(", ") || "none"}`, ...verdict.lines].join("\n"))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Coverage\n${verdict.lines.join("\n")}\n${enforcement === "evaluate" && !verdict.passed ? "\n_Evaluate mode (BOT_CI_COVERAGE): this doesn't fail Build yet._\n" : ""}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `passed=${verdict.passed}\nmode=${mode}\n`)
  if (verdict.passed) return
  if (enforcement === "enforce") {
    console.log(`::error title=Coverage::${verdict.lines[0]?.replace(/\*/g, "")}; the job summary lists the lines`)
    process.exitCode = 1
  } else console.log(`::warning title=Coverage::${verdict.lines[0]?.replace(/\*/g, "")}; this fails Build once BOT_CI_COVERAGE=enforce`)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.log(`::error title=Coverage::${(error as Error).message.split("\n")[0]}`)
    process.exitCode = coverageEnforcementOf(process.env.BOT_CI_COVERAGE) === "enforce" ? 1 : 0
  }
}
