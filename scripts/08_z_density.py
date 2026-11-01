#!/usr/bin/env python3
"""Compute Z-DNA counts and densities per assembly from the ZSeeker outputs.

  z_count    number of predicted Z-DNA regions
  z_bases    bases covered by the predicted regions (overlapping regions merged)
  z_density  z_bases / genome_size_manual
"""

import argparse
import csv
import sys
from pathlib import Path

import pandas as pd

csv.field_size_limit(sys.maxsize)


def merged_length(intervals):
    """Total length of the union of half-open intervals."""
    total, cur_start, cur_end = 0, None, None
    for start, end in sorted(intervals):
        if cur_end is None or start > cur_end:
            if cur_end is not None:
                total += cur_end - cur_start
            cur_start, cur_end = start, end
        else:
            cur_end = max(cur_end, end)
    if cur_end is not None:
        total += cur_end - cur_start
    return total


def z_stats(path):
    """Read a ZSeeker CSV (columns: chromosome, start, end, ...; 0-based closed coordinates)."""
    by_seq, count = {}, 0
    with open(path, newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            try:
                start, end = int(float(row[1])), int(float(row[2])) + 1  # -> half-open
            except (ValueError, IndexError):
                continue
            by_seq.setdefault(row[0], []).append((start, end))
            count += 1
    return count, sum(merged_length(iv) for iv in by_seq.values())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metadata", type=Path, default=Path("data/assembly_metadata_taxonomy.tsv"))
    ap.add_argument("--zseeker-dir", type=Path, default=Path("zseeker"))
    ap.add_argument("--size-col", default="genome_size_manual")
    ap.add_argument("--out", type=Path, default=Path("data/z_densities.tsv"))
    args = ap.parse_args()

    meta = pd.read_csv(args.metadata, sep="\t", usecols=["assembly_accession", args.size_col])
    meta = meta[pd.to_numeric(meta[args.size_col], errors="coerce") > 0]

    z_files = {"_".join(p.name.split("_")[:2]): p for p in args.zseeker_dir.glob("*.zseeker.csv")}

    rows = []
    for acc, size in zip(meta["assembly_accession"], meta[args.size_col]):
        if acc not in z_files:
            rows.append((acc, "NA", "NA", "NA"))
            continue
        count, bases = z_stats(z_files[acc])
        rows.append((acc, count, bases, f"{bases / float(size):.10g}"))

    out = pd.DataFrame(rows, columns=["assembly_accession", "z_count", "z_bases", "z_density"])
    out.sort_values("assembly_accession").to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()
