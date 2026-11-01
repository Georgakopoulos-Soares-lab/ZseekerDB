#!/usr/bin/env bash
# Download all selected genome FASTA files (*_genomic.fna.gz) with aria2c and verify
# each file against the MD5 checksum NCBI publishes in its assembly directory
# (md5checksums.txt). Re-running resumes interrupted downloads, skips finished ones
# and repeats the verification.
#
# Outputs:
#   <GENOME_DIR>/<assembly>_genomic.fna.gz
#   <GENOME_DIR>/md5/<assembly>.md5checksums.txt   NCBI checksum files
#   <REPORT>  assembly_accession, file, md5_ncbi, md5_local, status
#             status: OK | MISMATCH | MISSING_FILE | NO_NCBI_MD5
# Exits with status 1 if any file is not OK: delete the listed FASTA files and re-run.
#
# SKIP_DOWNLOAD=1 skips the FASTA download (verify files already on disk).
# THREADS sets the number of parallel md5sum processes (default 8).
#
# Usage: bash scripts/03_download_genomes.sh [URL_LIST] [GENOME_DIR] [REPORT]

set -euo pipefail

URLS=${1:-data/genome_urls.txt}
GENOME_DIR=${2:-genomes}
REPORT=${3:-data/genome_md5_verification.tsv}
THREADS=${THREADS:-8}
MD5_DIR="$GENOME_DIR/md5"
mkdir -p "$GENOME_DIR" "$MD5_DIR" "$(dirname "$REPORT")"

ARIA=(aria2c --no-conf=true --continue=true --auto-file-renaming=false --allow-overwrite=false
      --max-concurrent-downloads=8 --max-connection-per-server=1 --split=1
      --max-tries=20 --retry-wait=30 --timeout=60 --connect-timeout=30 --console-log-level=warn)

# 1. Genome FASTA files
if [[ "${SKIP_DOWNLOAD:-0}" != 1 ]]; then
  "${ARIA[@]}" --input-file="$URLS" --dir="$GENOME_DIR"
fi

# 2. NCBI md5checksums.txt of each assembly directory, saved as <assembly>.md5checksums.txt
awk '{ d = $0; sub(/\/[^\/]*$/, "", d); n = d; sub(/.*\//, "", n)
       print d "/md5checksums.txt"; print "  out=" n ".md5checksums.txt" }' "$URLS" \
  > "$MD5_DIR/md5_urls.txt"
"${ARIA[@]}" --input-file="$MD5_DIR/md5_urls.txt" --dir="$MD5_DIR"

# 3. Expected checksum of <assembly>_genomic.fna.gz in each NCBI file
find "$MD5_DIR" -name '*.md5checksums.txt' -print0 |
  xargs -0 -r awk -v OFS='\t' '
    FNR == 1 { n = FILENAME; sub(/.*\//, "", n); sub(/\.md5checksums\.txt$/, "", n)
               want = "./" n "_genomic.fna.gz" }
    $2 == want { print n "_genomic.fna.gz", $1 }' |
  sort -u > "$MD5_DIR/ncbi_md5.tsv"

# 4. Checksums of the local files
( cd "$GENOME_DIR" && find . -maxdepth 1 -name '*_genomic.fna.gz' -printf '%f\0' |
    xargs -0 -r -n 64 -P "$THREADS" md5sum ) |
  awk -v OFS='\t' '{ f = $2; sub(/^\*/, "", f); print f, $1 }' |
  sort -u > "$MD5_DIR/local_md5.tsv"

# 5. Report: one row per URL in the list
awk -F'\t' -v OFS='\t' '
  FILENAME == ARGV[1] { ncbi[$1] = $2; next }
  FILENAME == ARGV[2] { loc[$1] = $2; next }
  FNR == 1 { print "assembly_accession", "file", "md5_ncbi", "md5_local", "status" }
  {
    f = $0; sub(/.*\//, "", f)
    acc = f; if (match(f, /^GC[AF]_[0-9]+\.[0-9]+/)) acc = substr(f, RSTART, RLENGTH)
    s = !(f in loc) ? "MISSING_FILE" : !(f in ncbi) ? "NO_NCBI_MD5" : (loc[f] == ncbi[f] ? "OK" : "MISMATCH")
    print acc, f, (f in ncbi ? ncbi[f] : "NA"), (f in loc ? loc[f] : "NA"), s
  }' "$MD5_DIR/ncbi_md5.tsv" "$MD5_DIR/local_md5.tsv" "$URLS" > "$REPORT"

echo "MD5 verification ($REPORT):" >&2
awk -F'\t' 'NR > 1 { n[$5]++ } END { for (s in n) printf "  %-12s %d\n", s, n[s] }' "$REPORT" >&2
if awk -F'\t' 'NR > 1 && $5 != "OK" { bad = 1 } END { exit !bad }' "$REPORT"; then
  echo "Files not OK are listed in $REPORT; delete them and re-run this script." >&2
  exit 1
fi
