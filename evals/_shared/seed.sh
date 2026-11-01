#!/usr/bin/env bash
# Seeds a learner into the eval run's temporary HOME (the data root the plugin uses by default)
# and registers the run's workspace (the current directory) as a learning workspace.
# Usage (from a case's seed.sh): bash "$(dirname "$0")/../_shared/seed.sh" <sample|empty|corrupt> [no-workspace]
set -euo pipefail
MODE="${1:-sample}"
SHARED="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SHARED/../.." && pwd)"
WORKSPACE="$PWD"
if [ "${2:-}" = "no-workspace" ]; then WORKSPACE=""; fi
node "$PLUGIN_ROOT/server/scripts/run-ts.mjs" "$PLUGIN_ROOT/server/scripts/seed-sample.ts" \
  "$HOME/LearningMentor" ${WORKSPACE:+"$WORKSPACE"} "--mode=$MODE"
