#!/usr/bin/env python3
"""Compare ZSeeker and nBMST Z-DNA predictions (human and mouse T2T assemblies).

Both are converted to 0-based half-open intervals before comparison:
  ZSeeker CSV : 0-based start, 0-based inclusive end  -> [Start, End + 1)
  nBMST _Z.tsv: 1-based start, 1-based inclusive stop -> [Start - 1, Stop)
Overlap is computed on each tool's merged intervals.

Output: one row per assembly with locus counts, bp, median lengths,
directional base-pair coverage and base-pair Jaccard index.
"""

import argparse
import csv
import sys
from pathlib import Path

import numpy as np
import pandas as pd

csv.field_size_limit(sys.maxsize)

ASSEMBLIES = [
    ("Homo sapiens", "T2T-CHM13v2.0", "GCF_009914755.1"),
    ("Mus musculus", "T2T_mhaESC_v1.0", "GCA_050437135.1"),
]


def read_zseeker(path):
    out = {}
    with open(path, newline="") as f:
        r = csv.reader(f)
        next(r, None)
        for row in r:
            if len(row) >= 5 and row[4]:
                out.setdefault(row[0], []).append((int(row[1]), int(row[2]) + 1))
    return out


def read_nbmst(path):
    out = {}
    with open(path, newline="") as f:
        r = csv.reader(f, delimiter="\t")
        next(r, None)
        for row in r:
            out.setdefault(row[0], []).append((int(row[3]) - 1, int(row[4])))
    return out


def merge_intervals(iv):
    out = []
    for s, e in sorted(iv):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def intersect_bp(a, b):
    i = j = total = 0
    while i < len(a) and j < len(b):
        total += max(0, min(a[i][1], b[j][1]) - max(a[i][0], b[j][0]))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return total


def only_match(directory, pattern):
    hits = sorted(directory.glob(pattern))
    if len(hits) != 1:
        raise FileNotFoundError(f"Expected one file matching {directory / pattern}, found {len(hits)}")
    return hits[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zseeker-dir", type=Path, default=Path("zseeker"))
    ap.add_argument("--nbmst-dir", type=Path, default=Path("data/nbmst"))
    ap.add_argument("--out", type=Path, default=Path("data/benchmarking/nbmst_comparison.tsv"))
    args = ap.parse_args()

    rows = []
    for species, name, acc in ASSEMBLIES:
        Z = read_zseeker(only_match(args.zseeker_dir, f"{acc}_*.zseeker.csv"))
        N = read_nbmst(only_match(args.nbmst_dir, f"{acc}_*_Z.tsv"))
        Zm = {c: merge_intervals(v) for c, v in Z.items()}
        Nm = {c: merge_intervals(v) for c, v in N.items()}
        bp_z = sum(e - s for v in Zm.values() for s, e in v)
        bp_n = sum(e - s for v in Nm.values() for s, e in v)
        inter = sum(intersect_bp(Zm[c], Nm[c]) for c in Zm.keys() & Nm.keys())
        rows.append({
            "Species": species, "Assembly_name": name, "Assembly_accession": acc,
            "ZSeeker_loci": sum(map(len, Z.values())), "ZSeeker_bp": bp_z,
            "ZSeeker_median_len_bp": np.median([e - s for v in Z.values() for s, e in v]),
            "nBMST_loci": sum(map(len, N.values())), "nBMST_bp": bp_n,
            "nBMST_median_len_bp": np.median([e - s for v in N.values() for s, e in v]),
            "Intersection_bp": inter,
            "Pct_ZSeeker_bp_in_nBMST": round(100 * inter / bp_z, 1),
            "Pct_nBMST_bp_in_ZSeeker": round(100 * inter / bp_n, 1),
            "BP_Jaccard": round(inter / (bp_z + bp_n - inter), 3),
        })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()
