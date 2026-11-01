#!/usr/bin/env bash
# Run ZSeeker on every assembly in the final metadata table.
# Output: <OUT_DIR>/<assembly>_genomic.zseeker.csv (existing outputs are skipped).
#
# Usage: bash scripts/07_run_zseeker.sh [METADATA] [GENOME_DIR] [OUT_DIR]

set -euo pipefail

METADATA=${1:-data/assembly_metadata_taxonomy.tsv}
GENOME_DIR=${2:-genomes}
OUT_DIR=${3:-zseeker}

mkdir -p "$OUT_DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
shopt -s nullglob

awk -F'\t' 'NR == 1 { for (i = 1; i <= NF; i++) if ($i == "assembly_accession") c = i; next }
            { print $c }' "$METADATA" |
while read -r acc; do
  for fasta in "$GENOME_DIR/${acc}"_*_genomic.fna.gz; do
    base=$(basename "$fasta" .fna.gz)
    out="$OUT_DIR/${base}.zseeker.csv"
    [[ -s "$out" ]] && continue

    gunzip -c "$fasta" > "$TMP/${base}.fasta"
    ZSeeker --fasta "$TMP/${base}.fasta" --output_dir "$TMP/out" < /dev/null

    csv=( "$TMP"/out/*.csv )
    mv "${csv[0]}" "$out"
    rm -rf "${TMP:?}"/*
  done
done
