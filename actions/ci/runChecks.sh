#!/usr/bin/env bash
# run the bot-ci plan: install, then every check even after one fails, so a PR
# shows all of its problems at once. INSTALL and CHECKS ("name<TAB>command"
# lines) come from planChecks.ts.
set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
failed=()

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
