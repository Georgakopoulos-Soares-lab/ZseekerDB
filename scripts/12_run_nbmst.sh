#!/usr/bin/env bash
# Z-DNA motif predictions with the non-B DB motif search tool (nBMST; gfa from non-B_gfa)
# on the human and mouse T2T assemblies, for the comparison with ZSeeker (step 13).
#
# gfa reports alternating purine/pyrimidine runs (excluding AT/TA) as Z_DNA_Motif
# records; it is run with its default minimum length (-minZlen 10) and all other
# motif searches disabled. gfa reads one sequence per run, so every FASTA record is
# processed separately and the per-record tables are concatenated.
# Output coordinates are 1-based, inclusive.
#
# Requires: gfa, built from https://github.com/abcsFrederick/non-B_gfa
# Usage: GFA=/path/to/gfa bash scripts/12_run_nbmst.sh [GENOME_DIR] [OUT_DIR]

set -euo pipefail

GFA=${GFA:-gfa}
GENOME_DIR=${1:-genomes}
OUT_DIR=${2:-data/nbmst}
ACCESSIONS=(GCF_009914755.1 GCA_050437135.1)      # T2T-CHM13v2.0, T2T_mhaESC_v1.0
SKIP=(-skipAPR -skipSTR -skipDR -skipMR -skipIR -skipGQ
      -skipSlipped -skipCruciform -skipTriplex -skipWGET)

mkdir -p "$OUT_DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
shopt -s nullglob

for acc in "${ACCESSIONS[@]}"; do
  fasta=$(ls "$GENOME_DIR/${acc}"_*_genomic.fna.gz)
  base=$(basename "$fasta" .fna.gz)
  rm -rf "${TMP:?}"/*

  # One FASTA file per record, numbered in genome order
  zcat "$fasta" | awk -v d="$TMP" '
    /^>/ { if (f) close(f); f = sprintf("%s/%06d.fa", d, ++n) }
    { print > f }'

  for rec in "$TMP"/*.fa; do
    "$GFA" -seq "$rec" -out "${rec%.fa}" "${SKIP[@]}" > /dev/null
  done

  # Concatenate the per-record Z-DNA tables, keeping a single header
  awk 'FNR == 1 && NR != 1 { next } 1' "$TMP"/*_Z.tsv > "$OUT_DIR/${base}_Z.tsv"
done
