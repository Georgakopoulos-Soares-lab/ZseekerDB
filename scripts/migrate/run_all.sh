#!/usr/bin/env bash
# Orchestrate the full migration once extraction completes.
set -o pipefail
cd "$(dirname "$0")"
BUILD=/scratch/10899/kimopro/ZSeekerDB_migration/build
LOG=$BUILD/logs
EXTRACT_LOG=$LOG/extract.log
DRIVER_LOG=$LOG/run_all.log
PY=python3

say(){ echo "[$(date '+%F %T')] $*" | tee -a "$DRIVER_LOG"; }

say "waiting for extraction to finish (DONE_EXTRACT marker)…"
while true; do
  if grep -q DONE_EXTRACT "$EXTRACT_LOG" 2>/dev/null; then say "extraction DONE"; break; fi
  if grep -q FAILED_EXTRACT "$EXTRACT_LOG" 2>/dev/null; then say "extraction FAILED - aborting"; exit 1; fi
  # abort if the extractor process died without a marker
  if ! pgrep -f 'tar -xf - -C .*build/csv' >/dev/null 2>&1; then
     if ! grep -q DONE_EXTRACT "$EXTRACT_LOG" 2>/dev/null; then
        say "extractor process gone and no DONE marker; files=$(ls -1 $BUILD/csv | wc -l) - aborting"; exit 1; fi
  fi
  sleep 20
done

say "files extracted: $(ls -1 $BUILD/csv | wc -l)"

say "STAGE 1/4 audit"
$PY audit.py 2>&1 | tee -a "$DRIVER_LOG" || { say "audit failed"; exit 1; }

say "STAGE 2/4 build_data (long)"
$PY build_data.py 2>&1 | tee -a "$DRIVER_LOG" || { say "build_data failed"; exit 1; }

say "STAGE 3/4 build_meta_stats"
$PY build_meta_stats.py 2>&1 | tee -a "$DRIVER_LOG" || { say "build_meta_stats failed"; exit 1; }

say "STAGE 4/4 verify"
$PY verify.py 2>&1 | tee -a "$DRIVER_LOG" || { say "verify reported issues"; }

say "ALL DONE — db at /scratch/10899/kimopro/ZSeekerDB_migration/zdnadatabase.duckdb"
echo "PIPELINE_DONE" >> "$DRIVER_LOG"
