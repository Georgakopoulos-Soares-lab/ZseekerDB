#!/usr/bin/env python3
"""Species-level composition and density statistics (Figure 6A-D).

Unit of analysis: species (species_taxid); assembly values are summarized per species
by their median.

Dinucleotide classes are closed under reverse complementation, so one-strand counts
in loci are comparable with the both-strand genome frequencies:
  GC/CG         GC, CG
  CA/TG + AC/GT CA, TG, AC, GT
  AT/TA         AT, TA
  Other         AA, TT, CC, GG, AG, CT, GA, TC

Enrichment   = log2(loci dinucleotide frequency / genome observed frequency)
Genomic G+C  = sqrt(CC_exp) + sqrt(GG_exp)   (FASTA base counts, N excluded)
Density      = z_density * 1000              (bp/kb of N-corrected genome)

Outputs (in --outdir):
  species_values.tsv         per-species medians used by all panels
  pooled_composition.tsv     fraction of all loci dinucleotides per class
  enrichment.tsv             Fig. 6A: log2 enrichment per class and superkingdom
  gc_density_spearman.tsv    Fig. 6B: Spearman G+C vs density
  composition_by_gc.tsv      Fig. 6C: loci composition across 5% G+C bins
  density_by_superkingdom.tsv  Fig. 6D: density per superkingdom
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

SPECIES = "species_taxid"
SK_ORDER = ["Bacteria", "Archaea", "Eukaryota", "Viruses"]
CLASSES = {
    "GC_CG": ("GC/CG", ["GC", "CG"]),
    "CA_TG": ("CA/TG + AC/GT", ["CA", "TG", "AC", "GT"]),
    "AT_TA": ("AT/TA", ["AT", "TA"]),
    "other": ("Other", ["AA", "TT", "CC", "GG", "AG", "CT", "GA", "TC"]),
}
ALL_DINUC = sum((m for _, m in CLASSES.values()), [])
PSEUDO = 0.5
GC_BINS = np.arange(0, 101, 5)
MIN_SPECIES_PER_BIN = 10


def quartiles(s):
    s = s.dropna()
    return s.median(), s.quantile(0.25), s.quantile(0.75)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metadata", type=Path, default=Path("data/assembly_metadata_taxonomy.tsv"))
    ap.add_argument("--genome-freqs", type=Path, default=Path("data/genome_dinucleotides.tsv"))
    ap.add_argument("--densities", type=Path, default=Path("data/z_densities.tsv"))
    ap.add_argument("--loci", type=Path, default=Path("data/loci_dinucleotides.tsv"))
    ap.add_argument("--outdir", type=Path, default=Path("data/benchmarking"))
    args = ap.parse_args()
    out = args.outdir
    out.mkdir(parents=True, exist_ok=True)

    meta = pd.read_csv(args.metadata, sep="\t", dtype=str, keep_default_na=False,
                       usecols=["assembly_accession", SPECIES, "superkingdom"])
    df = (meta.merge(pd.read_csv(args.genome_freqs, sep="\t"), on="assembly_accession", how="left")
              .merge(pd.read_csv(args.densities, sep="\t", na_values=["NA"]), on="assembly_accession", how="left")
              .merge(pd.read_csv(args.loci, sep="\t"), on="assembly_accession", how="left"))

    df["gc_pct"] = 100 * (np.sqrt(df["CC_exp_freq"]) + np.sqrt(df["GG_exp_freq"]))
    df["density"] = df["z_density"] * 1000

    total = df[[f"loci_{d}" for d in ALL_DINUC]].sum(axis=1, min_count=1)
    has_loci = total > 0
    for key, (_, members) in CLASSES.items():
        count = df[[f"loci_{d}" for d in members]].sum(axis=1, min_count=1)
        genome = df[[f"{d}_obs_freq" for d in members]].sum(axis=1, min_count=1)
        df[f"loci_frac_{key}"] = (count / total).where(has_loci)
        df[f"genome_frac_{key}"] = genome
        df[f"log2oe_{key}"] = np.log2(((count + PSEUDO) / (total + PSEUDO * len(CLASSES))) / genome).where(has_loci)

    # ---- species level
    value_cols = ["gc_pct", "density"] + [c for c in df.columns
                                          if c.startswith(("loci_frac_", "genome_frac_", "log2oe_"))]
    d = df[df["superkingdom"].isin(SK_ORDER) & df[SPECIES].ne("")]
    sp = d.groupby(["superkingdom", SPECIES], as_index=False).agg(
        n_assemblies=("assembly_accession", "size"), **{c: (c, "median") for c in value_cols})
    sp.to_csv(out / "species_values.tsv", sep="\t", index=False)
    groups = [("All", sp)] + [(sk, sp[sp["superkingdom"] == sk]) for sk in SK_ORDER]

    # ---- pooled composition of all predicted loci
    pooled = df[[f"loci_{d}" for d in ALL_DINUC]].sum()
    pd.DataFrame([{"class": label, "fraction": pooled[[f"loci_{d}" for d in members]].sum() / pooled.sum()}
                  for label, members in CLASSES.values()]).to_csv(out / "pooled_composition.tsv", sep="\t", index=False)

    # ---- A. enrichment
    rows = []
    for key, (label, _) in CLASSES.items():
        for name, g in groups:
            v = g[f"log2oe_{key}"].dropna()
            med, q1, q3 = quartiles(v)
            rows.append({"class_key": key, "class": label, "group": name, "n_species": len(v),
                         "median_loci_frac": g[f"loci_frac_{key}"].median(),
                         "median_genome_frac": g[f"genome_frac_{key}"].median(),
                         "median_log2_enrichment": med, "q1": q1, "q3": q3,
                         "pct_species_enriched": (v > 0).mean() * 100})
    pd.DataFrame(rows).to_csv(out / "enrichment.tsv", sep="\t", index=False)

    # ---- B. G+C vs density
    rows = []
    for name, g in groups:
        x = g.dropna(subset=["gc_pct", "density"])
        rho, p = spearmanr(x["gc_pct"], x["density"]) if len(x) > 2 else (np.nan, np.nan)
        rows.append({"group": name, "n_species": len(x), "rho": rho, "p": p})
    pd.DataFrame(rows).to_csv(out / "gc_density_spearman.tsv", sep="\t", index=False)

    # ---- C. loci composition across genomic G+C
    rows = []
    for b, g in sp.groupby(pd.cut(sp["gc_pct"], GC_BINS), observed=True):
        row = {"gc_bin": str(b), "gc_mid": b.mid, "n_species": int(g["loci_frac_GC_CG"].notna().sum())}
        for key in ("GC_CG", "CA_TG"):
            row[f"{key}_median"], row[f"{key}_q1"], row[f"{key}_q3"] = quartiles(g[f"loci_frac_{key}"])
        rows.append(row)
    bins = pd.DataFrame(rows)
    bins[bins["n_species"] >= MIN_SPECIES_PER_BIN].to_csv(out / "composition_by_gc.tsv", sep="\t", index=False)

    # ---- D. density per superkingdom
    rows = []
    for sk in SK_ORDER:
        x = sp.loc[sp["superkingdom"] == sk, "density"].dropna()
        med, q1, q3 = quartiles(x)
        rows.append({"superkingdom": sk, "n_species": len(x), "n_zero": int((x == 0).sum()),
                     "pct_zero": (x == 0).mean() * 100, "median": med, "q1": q1, "q3": q3})
    pd.DataFrame(rows).to_csv(out / "density_by_superkingdom.tsv", sep="\t", index=False)


if __name__ == "__main__":
    main()
