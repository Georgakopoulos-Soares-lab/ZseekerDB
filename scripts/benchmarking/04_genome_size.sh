#!/usr/bin/env bash
# Compute the genome size of each assembly directly from its FASTA:
#   genome_size_fasta  = total number of bases
#   genome_size_manual = total bases minus N stretches longer than MIN_GAP nt
# This reproduces NCBI's ungapped genome size definition.
#
# Usage: bash scripts/04_genome_size.sh [GENOME_DIR] [OUT_TSV]

set -euo pipefail

GENOME_DIR=${1:-genomes}
OUT=${2:-data/genome_sizes.tsv}
MIN_GAP=10

printf "assembly_accession\tgenome_size_fasta\tgenome_size_manual\n" > "$OUT"

for fasta in "$GENOME_DIR"/*_genomic.fna.gz; do
  acc=$(basename "$fasta" | sed -E 's/^(GC[AF]_[0-9]+\.[0-9]+)_.*/\1/')

  zcat "$fasta" | LC_ALL=C awk -v acc="$acc" -v min="$MIN_GAP" '
    function close_run() { if (run > min) gap += run; run = 0 }

    /^>/ { close_run(); next }          # N runs never span two records

    {
      s = toupper($0)
      gsub(/[[:space:]]/, "", s)
      total += length(s)
      while (s != "") {
        if (match(s, /^N+/)) {          # N run, may continue on the next line
          run += RLENGTH
          s = substr(s, RLENGTH + 1)
        } else {                        # non-N base ends the current run
          close_run()
          s = match(s, /N/) ? substr(s, RSTART) : ""
        }
      }
    }

    END { close_run(); printf "%s\t%d\t%d\n", acc, total, total - gap }
  ' >> "$OUT"
done
