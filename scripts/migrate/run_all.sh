#!/usr/bin/env bash
# Orchestrate a source-CSV build after extraction completes.
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"
MIG_ROOT=${MIG_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}
export MIG_ROOT
BUILD="$MIG_ROOT/build"
CSV_DIR=${MIG_CSV_DIR:-$BUILD/csv}
LOG="$BUILD/logs"
EXTRACT_LOG="$LOG/extract.log"
DRIVER_LOG="$LOG/run_all.log"
PY=${PYTHON:-python3}
mkdir -p "$LOG"

say(){ echo "[$(date '+%F %T')] $*" | tee -a "$DRIVER_LOG"; }

if [[ ${MIG_WAIT_FOR_EXTRACTION:-1} == 1 ]]; then
  say "waiting for extraction to finish (DONE_EXTRACT marker)…"
  until grep -q DONE_EXTRACT "$EXTRACT_LOG" 2>/dev/null; do
    if grep -q FAILED_EXTRACT "$EXTRACT_LOG" 2>/dev/null; then
      say "extraction FAILED - aborting"; exit 1
    fi
    if ! pgrep -f 'tar -xf - -C .*build/csv' >/dev/null 2>&1; then
      say "extractor gone without DONE_EXTRACT; for independently completed inputs set MIG_WAIT_FOR_EXTRACTION=0"
      exit 1
    fi
    sleep 20
  done
fi
[[ -d "$CSV_DIR" ]] || { say "CSV input directory missing: $CSV_DIR"; exit 1; }

say "STAGE 1/4 audit"
"$PY" audit.py 2>&1 | tee -a "$DRIVER_LOG"
say "STAGE 2/4 build_data"
"$PY" build_data.py 2>&1 | tee -a "$DRIVER_LOG"
say "STAGE 3/4 build_meta_stats"
"$PY" build_meta_stats.py 2>&1 | tee -a "$DRIVER_LOG"
say "STAGE 4/4 verify"
"$PY" verify.py 2>&1 | tee -a "$DRIVER_LOG"
say "ALL DONE — db at ${MIG_DB_PATH:-$MIG_ROOT/zdnadatabase.duckdb}"
echo "PIPELINE_DONE" >> "$DRIVER_LOG"
