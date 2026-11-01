#!/usr/bin/env python3
"""Filter the selected assemblies and remove GenBank/RefSeq duplicates.

Filters:
  * assembly_type in {alternate-pseudohaplotype, unresolved-diploid}
  * group in {metagenomes, other}
  * NCBI genome_size_ungapped < 1,000 bp
  * missing FASTA or compressed FASTA (.fna.gz) larger than 1 GiB

Deduplication: GCA_/GCF_ accessions sharing the same numeric core
(e.g. GCA_000001405.29 / GCF_000001405.40) are the same genome. One is kept per core,
preferring (1) RefSeq (GCF_), (2) the newest version.

The manually computed genome sizes (04_genome_size.sh) are added to the output.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

BAD_ASSEMBLY_TYPES = {"alternate-pseudohaplotype", "unresolved-diploid"}
BAD_GROUPS = {"metagenomes", "other"}
MIN_UNGAPPED_SIZE = 1_000
MAX_FASTA_BYTES = 1024**3
ACC_REGEX = r"^(GC[AF]_\d+\.\d+)_"


def fasta_sizes(genome_dir):
    """assembly_accession -> compressed FASTA size in bytes."""
    files = pd.Series(list(genome_dir.glob("*_genomic.fna.gz")), dtype=object)
    acc = files.map(lambda p: p.name).str.extract(ACC_REGEX)[0]
    return pd.Series(files.map(lambda p: p.stat().st_size).values, index=acc.values)


def dedup_gca_gcf(df):
    parts = df["assembly_accession"].str.extract(r"^(GC[AF])_(\d+)\.(\d+)$")
    ranked = pd.DataFrame({
        "core": parts[1],
        "is_refseq": parts[0].eq("GCF"),
        "version": parts[2].astype(int),
        "first_row": -np.arange(len(df)),
    }, index=df.index)

    winners = (
        ranked.sort_values(["is_refseq", "version", "first_row"], ascending=False)
        .drop_duplicates("core")
        .index
    )
    return df.loc[df.index.isin(winners)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metadata", type=Path, default=Path("data/assembly_metadata.tsv"))
    ap.add_argument("--genome-sizes", type=Path, default=Path("data/genome_sizes.tsv"))
    ap.add_argument("--genome-dir", type=Path, default=Path("genomes"))
    ap.add_argument("--out", type=Path, default=Path("data/assembly_metadata_filtered.tsv"))
    args = ap.parse_args()

    df = pd.read_csv(args.metadata, sep="\t", dtype=str, keep_default_na=False)

    ungapped = pd.to_numeric(df["genome_size_ungapped"], errors="coerce")
    fasta_bytes = df["assembly_accession"].map(fasta_sizes(args.genome_dir))

    keep = (
        ~df["assembly_type"].isin(BAD_ASSEMBLY_TYPES)
        & ~df["group"].isin(BAD_GROUPS)
        & ~(ungapped < MIN_UNGAPPED_SIZE)
        & fasta_bytes.notna()
        & (fasta_bytes <= MAX_FASTA_BYTES)
    )
    df = dedup_gca_gcf(df[keep])

    sizes = pd.read_csv(args.genome_sizes, sep="\t", dtype={"assembly_accession": str})
    df = df.merge(sizes, on="assembly_accession", how="left", validate="1:1")

    df.to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()
