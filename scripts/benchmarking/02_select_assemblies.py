#!/usr/bin/env python3
"""Select assemblies from the GenBank and RefSeq assembly summaries.

Selected set (GenBank + RefSeq combined):
  1. all assemblies with assembly_level == "Complete Genome"
  2. chromosome-level reference genomes whose taxid has no Complete Genome assembly

Outputs:
  assembly_metadata.tsv   metadata of the selected assemblies
  genome_urls.txt         one *_genomic.fna.gz URL per assembly
"""

import argparse
import csv
from pathlib import Path

import pandas as pd


def read_assembly_summary(path):
    with open(path) as f:
        for i, line in enumerate(f):
            if line.startswith("#assembly_accession"):
                columns = line.lstrip("#").rstrip("\n").split("\t")
                break
        else:
            raise ValueError(f"No #assembly_accession header in {path}")

    return pd.read_csv(
        path, sep="\t", skiprows=i + 1, names=columns, dtype=str,
        quoting=csv.QUOTE_NONE, keep_default_na=False,
    )


def fasta_url(ftp_path):
    ftp = ftp_path.rstrip("/")
    return f"{ftp}/{ftp.rsplit('/', 1)[-1]}_genomic.fna.gz"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--summaries", nargs="+", type=Path,
                    default=[Path("data/assembly_summary_genbank.txt"), Path("data/assembly_summary_refseq.txt")])
    ap.add_argument("--out-metadata", type=Path, default=Path("data/assembly_metadata.tsv"))
    ap.add_argument("--out-urls", type=Path, default=Path("data/genome_urls.txt"))
    args = ap.parse_args()

    df = pd.concat([read_assembly_summary(p) for p in args.summaries], ignore_index=True)

    is_complete = df["assembly_level"].eq("Complete Genome")
    complete_taxids = set(df.loc[is_complete, "taxid"])

    is_reference = (
        df["assembly_level"].eq("Chromosome")
        & df["refseq_category"].eq("reference genome")
        & ~df["taxid"].isin(complete_taxids)
    )
    has_ftp = ~df["ftp_path"].isin(["", "na"])

    sel = df[(is_complete | is_reference) & has_ftp].drop_duplicates("assembly_accession")

    args.out_metadata.parent.mkdir(parents=True, exist_ok=True)
    sel.to_csv(args.out_metadata, sep="\t", index=False)
    sel["ftp_path"].map(fasta_url).sort_values().to_csv(args.out_urls, index=False, header=False)


if __name__ == "__main__":
    main()
