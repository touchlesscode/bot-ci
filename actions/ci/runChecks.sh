#!/usr/bin/env bash
# run the bot-ci plan in two steps, so the packages token is only ever in the install's env:
#   runChecks.sh install   INSTALL (scripts off for pnpm/npm), the one step with NODE_AUTH_TOKEN
#   runChecks.sh checks    POSTINSTALL (the skipped lifecycle scripts), then every check even after
#                          one fails, so a PR shows all of its problems at once
# INSTALL, POSTINSTALL and CHECKS ("name<TAB>command" lines) come from planChecks.ts.
set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
phase="${1:-}"

if [[ "$phase" == install ]]; then
  echo "::group::install"
  if ! bash -c "$INSTALL"; then
    echo "::endgroup::"
    echo "| install | failed |" >> "$summary"
    echo "::error::Build: install failed ($INSTALL)"
    exit 1
  fi
  echo "::endgroup::"
  echo "| check | result |" >> "$summary"
  echo "|-------|--------|" >> "$summary"
  echo "| install | passed |" >> "$summary"
  exit 0
fi

[[ "$phase" == checks ]] || { echo "usage: runChecks.sh install|checks" >&2; exit 2; }
unset NODE_AUTH_TOKEN

if [[ -n "${POSTINSTALL:-}" ]]; then
  echo "::group::postinstall"
  if ! bash -c "$POSTINSTALL"; then
    echo "::endgroup::"
    echo "| postinstall | failed |" >> "$summary"
    echo "::error::Build: postinstall failed ($POSTINSTALL)"
    exit 1
  fi
  echo "::endgroup::"
  echo "| postinstall | passed |" >> "$summary"
fi

failed=()
while IFS=$'\t' read -r name command; do
  [[ -z "${name:-}" ]] && continue
  echo "::group::$name"
  if bash -c "$command"; then
    echo "| $name | passed |" >> "$summary"
  else
    failed+=("$name")
    echo "| $name | **failed** |" >> "$summary"
    echo "::error::Build: $name failed ($command)"
  fi
  echo "::endgroup::"
done <<< "${CHECKS:-}"

if (( ${#failed[@]} )); then
  echo "Build: failed: ${failed[*]}"
  exit 1
fi
echo "Build: all checks passed"
