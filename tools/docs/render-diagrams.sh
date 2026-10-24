#!/usr/bin/env bash
# Renders every Mermaid source (docs/**/*.mmd) to an SVG next to it.
# Usage: tools/docs/render-diagrams.sh [file.mmd ...]   (no argument = all diagrams)
set -euo pipefail
readonly MERMAID_CLI='@mermaid-js/mermaid-cli@11.4.2'
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly CONFIG_FILE="${REPOSITORY_ROOT}/tools/docs/mermaid.config.json"
if [[ $# -gt 0 ]]; then
  sources=("$@")
else
  sources=()
  while IFS= read -r source; do
    sources+=("${source}")
  done < <(find "${REPOSITORY_ROOT}/docs" -name '*.mmd' | sort)
fi
for source in "${sources[@]}"; do
  echo "Rendering ${source#"${REPOSITORY_ROOT}/"}"
  npx -y "${MERMAID_CLI}" --quiet --configFile "${CONFIG_FILE}" --backgroundColor white \
    --input "${source}" --output "${source%.mmd}.svg"
done
