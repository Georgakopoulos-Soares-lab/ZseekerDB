#!/usr/bin/env python3
"""Dinucleotide counts within ZSeeker-predicted loci, one row per assembly.

Dinucleotides are counted on the strand reported by ZSeeker. Those containing a
non-ACGT character, or spanning two loci, are not counted.

Output columns: assembly_accession, n_loci, loci_bp, loci_AA ... loci_TT
"""

import argparse
import csv
import os
import re
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

csv.field_size_limit(sys.maxsize)

ORDER = [x + y for x in "ACGT" for y in "ACGT"]
ACC_RE = re.compile(r"^(GC[AF]_\d+\.\d+)_")

CODE = np.full(256, -1, dtype=np.int64)
for _i, _b in enumerate(b"ACGT"):
    CODE[_b] = CODE[_b + 32] = _i


def loci_counts(item):
    acc, path = item
    seqs = []
    with open(path, newline="") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) >= 5 and row[4]:              # contigs without loci have empty fields
                seqs.append(row[4])

    counts = np.zeros(16, dtype=np.int64)
    if seqs:
        c = CODE[np.frombuffer("N".join(seqs).encode("ascii"), dtype=np.uint8)]
        a, b = c[:-1], c[1:]
        ok = (a >= 0) & (b >= 0)
        counts = np.bincount(a[ok] * 4 + b[ok], minlength=16)
    return [acc, len(seqs), sum(map(len, seqs)), *counts]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metadata", type=Path, default=Path("data/assembly_metadata_taxonomy.tsv"))
    ap.add_argument("--zseeker-dir", type=Path, default=Path("zseeker"))
    ap.add_argument("--out", type=Path, default=Path("data/loci_dinucleotides.tsv"))
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    args = ap.parse_args()

    wanted = set(pd.read_csv(args.metadata, sep="\t", usecols=["assembly_accession"], dtype=str)
                 ["assembly_accession"])
    items = []
    for p in args.zseeker_dir.glob("*.zseeker.csv"):
        m = ACC_RE.match(p.name)
        if m and m.group(1) in wanted:
            items.append((m.group(1), p))

    with Pool(args.workers) as pool:
        rows = pool.map(loci_counts, items, chunksize=16)

    cols = ["assembly_accession", "n_loci", "loci_bp"] + [f"loci_{d}" for d in ORDER]
    pd.DataFrame(rows, columns=cols).sort_values("assembly_accession").to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()
