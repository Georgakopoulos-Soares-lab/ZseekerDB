#!/usr/bin/env python3
"""ZSeeker and nBMST Z-DNA predictions within the projected Rps6kl1 locus
of the mouse T2T assembly (GCA_050437135.1, CM115061.1).

Each locus is reported in three coordinate conventions:
  native  : ZSeeker = 0-based start, 0-based inclusive end
            nBMST   = 1-based start, 1-based inclusive stop
  BED     : 0-based start, half-open end (used for all overlap tests)
  1-based : 1-based start, inclusive end (genome-browser style)
The gene span and exons come from the Liftoff GFF3 (1-based inclusive).
"exon" = overlaps any lifted exon; "intron" = inside the gene span without exon overlap.
Loci containing the (CA)n(CACG)n element (either strand or orientation) are flagged.
"""

import argparse
import csv
import re
import sys
from pathlib import Path

import pandas as pd

csv.field_size_limit(sys.maxsize)

ACC = "GCA_050437135.1"
CONTIG = "CM115061.1"
ELEMENT_RE = [re.compile(p, re.IGNORECASE) for p in (
    r"(?:CA){4,}(?:CACG){3,}", r"(?:CGTG){3,}(?:TG){4,}",
    r"(?:CACG){3,}(?:CA){4,}", r"(?:TG){4,}(?:CGTG){3,}",
)]


def read_gene_model(path):
    """Gene span and exons as 0-based half-open intervals."""
    gene, exons = None, set()
    with open(path) as f:
        for line in f:
            x = line.rstrip("\n").split("\t")
            if line.startswith("#") or len(x) != 9 or x[0] != CONTIG:
                continue
            if x[2] == "gene":
                gene = (int(x[3]) - 1, int(x[4]))
            elif x[2] == "exon":
                exons.add((int(x[3]) - 1, int(x[4])))
    return gene, sorted(exons)


def only_match(directory, pattern):
    hits = sorted(directory.glob(pattern))
    if len(hits) != 1:
        raise FileNotFoundError(f"Expected one file matching {directory / pattern}, found {len(hits)}")
    return hits[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zseeker-dir", type=Path, default=Path("zseeker"))
    ap.add_argument("--nbmst-dir", type=Path, default=Path("data/nbmst"))
    ap.add_argument("--gff", type=Path, default=Path("data/rps6kl1/Rps6kl1_liftoff.gff3"))
    ap.add_argument("--out", type=Path, default=Path("data/benchmarking/rps6kl1_loci.tsv"))
    args = ap.parse_args()

    (g0, g1), exons = read_gene_model(args.gff)

    def location(s, e):
        if any(a < e and b > s for a, b in exons):
            return "exon"
        return "intron" if g0 <= s and e <= g1 else "partly outside gene"

    def record(tool, native_s, native_e, s, e, score, seq):
        return {"Tool": tool, "Contig": CONTIG,
                "Start_native": native_s, "End_native": native_e,
                "Start_BED_0based": s, "End_BED_halfopen": e,
                "Locus_1based_inclusive": f"{CONTIG}:{s + 1}-{e}",
                "Length_bp": e - s, "Score": score, "Genic_location": location(s, e),
                "Contains_CA_CACG_element": "yes" if any(rx.search(seq) for rx in ELEMENT_RE) else "no",
                "Sequence": seq}

    rows = []
    with open(only_match(args.zseeker_dir, f"{ACC}_*.zseeker.csv"), newline="") as f:
        r = csv.reader(f)
        next(r, None)
        for row in r:
            if len(row) < 5 or not row[4] or row[0] != CONTIG:
                continue
            s, e = int(row[1]), int(row[2])                   # 0-based, inclusive end
            if s < g1 and e + 1 > g0:
                rows.append(record("ZSeeker", s, e, s, e + 1, row[3], row[4]))

    with open(only_match(args.nbmst_dir, f"{ACC}_*_Z.tsv"), newline="") as f:
        r = csv.reader(f, delimiter="\t")
        next(r, None)
        for row in r:
            if row[0] != CONTIG:
                continue
            s, e = int(row[3]), int(row[4])                   # 1-based, inclusive stop
            if s - 1 < g1 and e > g0:
                rows.append(record("nBMST", s, e, s - 1, e, row[6], row[13]))

    out = pd.DataFrame(rows)
    out = out.assign(_tool=out["Tool"].ne("ZSeeker")).sort_values(["_tool", "Start_BED_0based"]).drop(columns="_tool")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()
