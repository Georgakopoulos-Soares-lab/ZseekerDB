#!/usr/bin/env python3
"""Genome-wide dinucleotide frequencies, one row per assembly.

Counts are taken on both strands (reverse-complement dinucleotides get identical
frequencies), as in EMBOSS `compseq -word 2 -reverse Y -calcfreq Y`:
  observed(XY) = both-strand count(XY) / all both-strand dinucleotides
  expected(XY) = f(X) * f(Y), with f the both-strand base frequencies
Non-ACGT characters are skipped; dinucleotides are not counted across records.

Output columns: assembly_accession, AA_obs_freq ... TT_obs_freq, AA_exp_freq ... TT_exp_freq
"""

import argparse
import gzip
import os
import re
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

ORDER = [x + y for x in "ACGT" for y in "ACGT"]
ACC_RE = re.compile(r"^(GC[AF]_\d+\.\d+)_")
COMP = np.array([3, 2, 1, 0])                     # A<->T, C<->G
RC = np.array([COMP[d % 4] * 4 + COMP[d // 4] for d in range(16)])
BLOCK = 1 << 22

CODE = np.full(256, -1, dtype=np.int64)
for _i, _b in enumerate(b"ACGT"):
    CODE[_b] = CODE[_b + 32] = _i                 # upper and lower case


def genome_freqs(item):
    acc, path = item
    mono = np.zeros(4, dtype=np.int64)
    di = np.zeros(16, dtype=np.int64)

    def consume(buf, prev):
        c = CODE[np.frombuffer(b"".join(buf), dtype=np.uint8)]
        if c.size == 0:
            return prev
        if prev >= 0 and c[0] >= 0:
            di[prev * 4 + c[0]] += 1
        mono[:] += np.bincount(c[c >= 0], minlength=4)
        a, b = c[:-1], c[1:]
        ok = (a >= 0) & (b >= 0)
        di[:] += np.bincount(a[ok] * 4 + b[ok], minlength=16)
        return int(c[-1])

    prev, buf, size = -1, [], 0
    with gzip.open(path, "rb") as f:
        for line in f:
            if line[:1] == b">":
                consume(buf, prev)
                prev, buf, size = -1, [], 0
                continue
            buf.append(line.rstrip(b"\r\n"))
            size += len(buf[-1])
            if size >= BLOCK:
                prev, buf, size = consume(buf, prev), [], 0
    consume(buf, prev)

    di2 = di + di[RC]
    mono2 = mono + mono[COMP]
    obs = di2 / di2.sum()
    f = mono2 / mono2.sum()
    exp = np.array([f[d // 4] * f[d % 4] for d in range(16)])
    return [acc, *obs, *exp]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metadata", type=Path, default=Path("data/assembly_metadata_taxonomy.tsv"))
    ap.add_argument("--genome-dir", type=Path, default=Path("genomes"))
    ap.add_argument("--out", type=Path, default=Path("data/genome_dinucleotides.tsv"))
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    args = ap.parse_args()

    wanted = set(pd.read_csv(args.metadata, sep="\t", usecols=["assembly_accession"], dtype=str)
                 ["assembly_accession"])
    items = []
    for p in args.genome_dir.glob("*_genomic.fna.gz"):
        m = ACC_RE.match(p.name)
        if m and m.group(1) in wanted:
            items.append((m.group(1), p))

    with Pool(args.workers) as pool:
        rows = pool.map(genome_freqs, items, chunksize=4)

    cols = ["assembly_accession"] + [f"{d}_obs_freq" for d in ORDER] + [f"{d}_exp_freq" for d in ORDER]
    pd.DataFrame(rows, columns=cols).sort_values("assembly_accession").to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()
