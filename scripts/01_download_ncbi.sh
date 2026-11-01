#!/usr/bin/env bash
# Download the NCBI assembly summaries (GenBank + RefSeq) and the NCBI taxonomy dump.
#
# Usage: bash scripts/01_download_ncbi.sh [OUT_DIR]

set -euo pipefail

OUT_DIR=${1:-data}
mkdir -p "$OUT_DIR/taxdump"

wget -N -P "$OUT_DIR" https://ftp.ncbi.nlm.nih.gov/genomes/genbank/assembly_summary_genbank.txt
wget -N -P "$OUT_DIR" https://ftp.ncbi.nlm.nih.gov/genomes/refseq/assembly_summary_refseq.txt

wget -N -P "$OUT_DIR/taxdump" https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/new_taxdump/new_taxdump.tar.gz
tar -xzf "$OUT_DIR/taxdump/new_taxdump.tar.gz" -C "$OUT_DIR/taxdump" rankedlineage.dmp merged.dmp
