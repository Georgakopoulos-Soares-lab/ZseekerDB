#!/usr/bin/env python3
"""Annotate assemblies with the NCBI ranked taxonomic lineage.

* Obsolete taxids are updated with merged.dmp. If the organism taxid is absent from
  rankedlineage.dmp, the species taxid is used instead.
* superkingdom is collapsed to Viruses, Bacteria, Archaea, Eukaryota. For viruses,
  the realm in rankedlineage.dmp (e.g. Riboviria, Duplodnaviria) is kept as viral_realm.
* Missing superkingdom/kingdom values are inferred from the NCBI assembly group
  (KINGDOM_BY_GROUP): fungi -> Fungi, plant -> Viridiplantae, invertebrate and
  vertebrate groups -> Metazoa, protozoa -> "Protists" (informal label).
* Missing lower ranks become "unclassified <nearest higher rank>".
* Any eukaryotic record still lacking a kingdom ("unclassified Eukaryota") is also
  labelled "Protists". "Protists" is a database label, not a formal NCBI kingdom;
  the NCBI phylum of every record is kept unchanged.
* updated_tax_name = tax_name + strain (from infraspecific_name), if not already in it.

Besides the annotated table (--out), a report (--report) lists, for every assembly whose
kingdom was not taken from the NCBI lineage, the rule applied, the NCBI group, the
assigned kingdom and the phylum, with assembly and species counts. The phyla grouped
under "Protists" are also printed to stderr.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

LINEAGE_COLS = ["taxid", "tax_name", "species", "genus", "family", "order",
                "class", "phylum", "kingdom", "superkingdom"]
RANKS = ["superkingdom", "kingdom", "phylum", "class", "order", "family", "genus", "tax_name"]
TAXONOMY_COLS = ["superkingdom", "viral_realm", "kingdom", "phylum", "class", "order",
                 "family", "genus", "species", "tax_name", "updated_tax_name"]

CELLULAR = {"Bacteria", "Archaea", "Eukaryota"}
EUKARYOTIC_GROUPS = {"fungi", "plant", "invertebrate", "protozoa",
                     "vertebrate_other", "vertebrate_mammalian"}
KINGDOM_BY_GROUP = {
    "viral": "unclassified Viruses",
    "bacteria": "unclassified Bacteria",
    "archaea": "unclassified Archaea",
    "fungi": "Fungi",
    "plant": "Viridiplantae",
    "invertebrate": "Metazoa",
    "vertebrate_other": "Metazoa",
    "vertebrate_mammalian": "Metazoa",
    "protozoa": "Protists",
}


def read_dmp(path, names):
    """Read an NCBI .dmp file (fields separated by '\\t|\\t', lines ending in '\\t|')."""
    with open(path) as f:
        rows = [line.rstrip("\n").removesuffix("\t|").split("\t|\t") for line in f]
    return pd.DataFrame(rows, columns=names, dtype=str)


def clean(s):
    s = s.astype("string").str.strip()
    return s.mask(s.eq("") | s.str.lower().eq("na"))


def propagate_unclassified(df, ranks):
    """Fill a missing rank with 'unclassified <nearest available higher rank>'."""
    for i, rank in enumerate(ranks[1:], start=1):
        for higher in reversed(ranks[:i]):
            hv = df[higher]
            fill = df[rank].isna() & hv.notna()
            if fill.any():
                label = hv.where(hv.str.startswith("unclassified", na=False), "unclassified " + hv)
                df.loc[fill, rank] = label[fill]
    return df


def write_report(df, group, rule, path):
    """Assemblies whose kingdom did not come from the NCBI lineage, grouped by rule."""
    rep = pd.DataFrame({
        "rule": rule, "superkingdom": df["superkingdom"], "ncbi_group": group,
        "kingdom_assigned": df["kingdom"], "phylum": df["phylum"],
        "assembly_accession": df["assembly_accession"], "species_taxid": df["species_taxid"],
    })
    rep = rep[rep["rule"].ne("ncbi_lineage")].fillna("NA")
    out = (rep.groupby(["rule", "superkingdom", "ncbi_group", "kingdom_assigned", "phylum"])
              .agg(n_assemblies=("assembly_accession", "size"),
                   n_species=("species_taxid", "nunique"))
              .reset_index()
              .sort_values(["rule", "superkingdom", "kingdom_assigned", "phylum"]))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(path, sep="\t", index=False)

    protists = sorted(set(df.loc[df["kingdom"].eq("Protists"), "phylum"].dropna()))
    print(f'"Protists" comprises {len(protists)} phyla: ' + ", ".join(protists), file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metadata", type=Path, default=Path("data/assembly_metadata_filtered.tsv"))
    ap.add_argument("--taxdump", type=Path, default=Path("data/taxdump"))
    ap.add_argument("--out", type=Path, default=Path("data/assembly_metadata_taxonomy.tsv"))
    ap.add_argument("--report", type=Path, default=Path("data/kingdom_inference_report.tsv"))
    args = ap.parse_args()

    asm = pd.read_csv(args.metadata, sep="\t", dtype=str, keep_default_na=False)
    input_cols = list(asm.columns)

    lineage = read_dmp(args.taxdump / "rankedlineage.dmp", LINEAGE_COLS)
    lineage["taxid"] = lineage["taxid"].str.strip()
    lineage = lineage.drop_duplicates("taxid")
    for col in LINEAGE_COLS[1:]:
        lineage[col] = clean(lineage[col])

    merged_map = read_dmp(args.taxdump / "merged.dmp", ["old", "new"])
    merged_map = dict(zip(merged_map["old"].str.strip(), merged_map["new"].str.strip()))

    # Choose the taxid used to join the lineage
    taxid = asm["taxid"].str.strip()
    taxid = taxid.map(merged_map).fillna(taxid)
    species_taxid = asm["species_taxid"].str.strip()
    species_taxid = species_taxid.map(merged_map).fillna(species_taxid)

    known = set(lineage["taxid"])
    use_species = ~taxid.isin(known) & species_taxid.isin(known)
    asm["lineage_taxid"] = taxid.mask(use_species, species_taxid)

    df = asm.merge(lineage.rename(columns={"taxid": "lineage_taxid"}),
                   on="lineage_taxid", how="left", validate="m:1")

    group = df["group"].str.lower()
    is_viral = group.eq("viral")
    raw_super = clean(df["superkingdom"])

    # Viral realm, taken directly from the lineage
    has_realm = is_viral & raw_super.notna() & raw_super.str.lower().ne("viruses").fillna(False)
    df["viral_realm"] = raw_super.where(has_realm).mask(is_viral & ~has_realm, "unclassified Viruses")

    # superkingdom: lineage value, otherwise inferred from the NCBI group
    superkingdom = np.select(
        [is_viral, raw_super.isin(CELLULAR), group.eq("bacteria"),
         group.eq("archaea"), group.isin(EUKARYOTIC_GROUPS)],
        ["Viruses", raw_super.to_numpy(dtype=object), "Bacteria", "Archaea", "Eukaryota"],
        default=None,
    )
    df["superkingdom"] = pd.Series(superkingdom, index=df.index, dtype="string")

    # kingdom: lineage value, otherwise inferred from the NCBI group
    lineage_kingdom = clean(df["kingdom"])
    df["kingdom"] = lineage_kingdom.fillna(group.map(KINGDOM_BY_GROUP))
    rule = pd.Series(np.where(lineage_kingdom.notna(), "ncbi_lineage",
                              np.where(df["kingdom"].notna(), "ncbi_group", "unassigned")),
                     index=df.index)
    df["tax_name"] = clean(df["tax_name"]).fillna(clean(df["organism_name"]))
    for col in RANKS:
        df[col] = clean(df[col])

    df = propagate_unclassified(df, RANKS)

    # Eukaryotes still without a kingdom -> "Protists"
    fallback = df["kingdom"].eq("unclassified Eukaryota")
    df.loc[fallback, "kingdom"] = "Protists"
    rule[fallback] = "eukaryote_fallback"

    write_report(df, group, rule, args.report)

    # updated_tax_name: append the strain name when it is not already part of tax_name
    strain = df["infraspecific_name"].astype("string").str.extract(r"^\s*strain=(.*)$")[0].str.strip()
    strain = strain.mask(strain.eq(""))
    tax = df["tax_name"]
    append = pd.Series(
        [pd.notna(s) and pd.notna(t) and s not in t for s, t in zip(strain, tax)],
        index=df.index,
    )
    df["updated_tax_name"] = tax.mask(append, tax + " " + strain)

    df = df[input_cols + TAXONOMY_COLS].sort_values(
        ["superkingdom", "kingdom", "viral_realm", "assembly_accession"], kind="mergesort"
    )
    df.to_csv(args.out, sep="\t", index=False)


if __name__ == "__main__":
    main()