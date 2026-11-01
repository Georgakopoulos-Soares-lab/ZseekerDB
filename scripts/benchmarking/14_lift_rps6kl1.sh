#!/usr/bin/env bash
# Project the Rps6kl1 gene model from GRCm39 onto the mouse T2T assembly in ZSeekerDB.
#   1. extract every GRCm39 GFF3 row of the gene (gene=, Name= or ID=gene- attribute)
#   2. extract the source chromosome (from the annotation) and the target chromosome
#   3. extract the source gene region (+/- 3 bp)
#   4. confirm the homologous target region with minimap2 (asm5, no secondary alignments)
#   5. transfer the annotation with Liftoff (min. sequence identity and coverage 0.90)
#
# Requires: wget, minimap2, liftoff
# Usage: bash scripts/13_lift_rps6kl1.sh [GENOME_DIR] [OUT_DIR]

set -euo pipefail

GENOME_DIR=$(realpath "${1:-genomes}")
OUT_DIR=${2:-data/rps6kl1}

GENE=Rps6kl1
SOURCE=GCF_000001635.27_GRCm39
SOURCE_URL=https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/001/635/${SOURCE}
TARGET_FASTA=$(ls "$GENOME_DIR"/GCA_050437135.1_*_genomic.fna.gz)
TARGET_CONTIG=CM115061.1
FLANK=3
PREFIX=${GENE}_liftoff

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

wget -N "${SOURCE_URL}/${SOURCE}_genomic.fna.gz" "${SOURCE_URL}/${SOURCE}_genomic.gff.gz"

extract_contig() {   # gzipped FASTA, contig name -> single-record FASTA on stdout
  zcat "$1" | awk -v id=">$2" '/^>/ { if (p) exit; p = ($1 == id) } p'
}

# 1. All GFF3 rows of the gene
{
  echo "##gff-version 3"
  zcat "${SOURCE}_genomic.gff.gz" | awk -F'\t' -v g="$GENE" '
    !/^#/ && NF == 9 {
      n = split($9, a, ";")
      for (i = 1; i <= n; i++)
        if (a[i] == "gene=" g || a[i] == "Name=" g || a[i] == "ID=gene-" g) { print; next }
    }' | sort -t$'\t' -k4,4n -k5,5n
} > "${PREFIX}.source.gff3"

SOURCE_CONTIG=$(awk -F'\t' '!/^#/ { print $1 }' "${PREFIX}.source.gff3" | sort -u)
if [[ $(wc -w <<< "$SOURCE_CONTIG") -ne 1 ]]; then
  echo "ERROR: ${GENE} annotation not found on exactly one source contig" >&2
  exit 1
fi
read -r START END < <(awk -F'\t' '$3 == "gene" { print $4, $5; exit }' "${PREFIX}.source.gff3")

# 2. Source and target chromosomes
extract_contig "${SOURCE}_genomic.fna.gz" "$SOURCE_CONTIG" > "${PREFIX}.source_chromosome.fa"
extract_contig "$TARGET_FASTA" "$TARGET_CONTIG" > "${PREFIX}.target_chromosome.fa"

# 3. Source gene region with a small flank (1-based inclusive)
awk -v s=$(( START > FLANK ? START - FLANK : 1 )) -v e=$(( END + FLANK )) -v id="$SOURCE_CONTIG" '
  NR > 1 {
    a = pos + 1; b = pos + length($0)
    if (b >= s && a <= e) {
      from = (s > a ? s : a); to = (e < b ? e : b)
      region = region substr($0, from - pos, to - from + 1)
    }
    pos = b
    if (pos >= e) exit
  }
  END {
    print ">" id ":" s "-" e
    for (i = 1; i <= length(region); i += 80) print substr(region, i, 80)
  }' "${PREFIX}.source_chromosome.fa" > "${PREFIX}.source_gene_region.fa"

# 4. Homology check
minimap2 -x asm5 --secondary=no "${PREFIX}.target_chromosome.fa" "${PREFIX}.source_gene_region.fa" \
  > "${PREFIX}.minimap2.paf"

# 5. Annotation transfer
liftoff -g "${PREFIX}.source.gff3" -o "${GENE}_liftoff.gff3" -u "${PREFIX}.unmapped.txt" \
  -a 0.90 -s 0.90 "${PREFIX}.target_chromosome.fa" "${PREFIX}.source_chromosome.fa"
