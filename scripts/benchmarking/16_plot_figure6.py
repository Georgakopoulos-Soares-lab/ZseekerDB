#!/usr/bin/env python3
"""Draw Figure 6A-D from the tables written by 11_composition_stats.py.

  A  log2 enrichment of dinucleotide classes in loci vs genome, per superkingdom
  B  genomic G+C vs Z-DNA density (one point per species, hexagonal bins)
  C  dinucleotide composition of loci across genomic G+C (median + IQR)
  D  density per superkingdom (all species, including zero density)

Density axes are linear from 0 to 1 bp/kb and logarithmic above.
All panels share one figure size; the panel A legend is saved separately.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

FIGSIZE = (5.6, 4.4)
SK_ORDER = ["Bacteria", "Archaea", "Eukaryota", "Viruses"]
SK_COLORS = {"Bacteria": "#f4c48f", "Archaea": "#cfcfff", "Eukaryota": "#c2dcc2", "Viruses": "#a6d3df"}
CLASS_LABELS = {"GC_CG": "GC/CG", "CA_TG": "CA/TG + AC/GT", "AT_TA": "AT/TA", "other": "Other"}
CLASS_TICKS = {"GC_CG": "GC/CG", "CA_TG": "CA/TG +\nAC/GT", "AT_TA": "AT/TA", "other": "Other"}
LINE_STYLE = {"GC_CG": ("#d98aa5", "o"), "CA_TG": ("#a99a5b", "s")}
DENS_LABEL = "Z-DNA density (bp/kb)"
Y_TICKS = [0, 1, 10, 100, 1000]           # density axis ticks
C_TICKS = [1, 10, 100, 1000, 3000]        # colour bar ticks (species per bin)
LW = 1.6

plt.rcParams.update({
    "font.size": 14, "axes.labelsize": 15, "xtick.labelsize": 13, "ytick.labelsize": 13,
    "legend.fontsize": 13, "axes.linewidth": LW,
    "xtick.major.width": LW, "ytick.major.width": LW, "xtick.major.size": 5, "ytick.major.size": 5,
    "axes.spines.top": False, "axes.spines.right": False, "pdf.fonttype": 42, "ps.fonttype": 42,
})

BOX_KW = dict(
    patch_artist=True, showfliers=False,
    boxprops=dict(linewidth=1.4, edgecolor="black"),
    whiskerprops=dict(linewidth=1.4), capprops=dict(linewidth=1.4),
    medianprops=dict(color="black", linewidth=1.8),
)


def density_axis(v):
    """0-1 bp/kb linear, then one equal step per decade."""
    v = np.asarray(v, dtype=float)
    return np.where(v < 1, v, 1 + np.log10(np.maximum(v, 1)))


def set_density_ticks(ax):
    ax.set_yticks(density_axis(Y_TICKS))
    ax.set_yticklabels([f"{t:g}" for t in Y_TICKS])
    ax.set_ylim(-0.15, density_axis(Y_TICKS[-1]) + 0.1)
    ax.set_ylabel(DENS_LABEL)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--indir", type=Path, default=Path("data/benchmarking"))
    ap.add_argument("--outdir", type=Path, default=Path("figures"))
    args = ap.parse_args()
    args.outdir.mkdir(parents=True, exist_ok=True)

    sp = pd.read_csv(args.indir / "species_values.tsv", sep="\t")
    spear = pd.read_csv(args.indir / "gc_density_spearman.tsv", sep="\t")
    bins = pd.read_csv(args.indir / "composition_by_gc.tsv", sep="\t")

    def save(fig, name, tight=False):
        kw = {"bbox_inches": "tight"} if tight else {}
        for ext in ("pdf", "png"):
            fig.savefig(args.outdir / f"{name}.{ext}", dpi=300, **kw)
        plt.close(fig)

    # ---- A. enrichment
    fig, ax = plt.subplots(figsize=FIGSIZE, constrained_layout=True)
    keys = list(CLASS_LABELS)
    width = 0.8 / len(SK_ORDER)
    for i, sk in enumerate(SK_ORDER):
        g = sp[sp["superkingdom"] == sk]
        data = [g[f"log2oe_{k}"].dropna().values for k in keys]
        pos = [j for j, x in enumerate(data) if len(x)]
        if not pos:
            continue
        bp = ax.boxplot([data[j] for j in pos],
                        positions=np.array(pos) + (i - (len(SK_ORDER) - 1) / 2) * width,
                        widths=width * 0.85, **BOX_KW)
        for b in bp["boxes"]:
            b.set_facecolor(SK_COLORS[sk])
    ax.axhline(0, ls="--", lw=1.2, color="grey", zorder=0)
    ax.set_xticks(range(len(keys)))
    ax.set_xticklabels([CLASS_TICKS[k] for k in keys])
    ax.set_ylabel("log$_2$(loci / genome)\ndinucleotide frequency")
    save(fig, "fig6A_enrichment")

    fig = plt.figure(figsize=(2.2, 1.9))
    fig.legend(handles=[Patch(facecolor=SK_COLORS[s], edgecolor="black", linewidth=1.4, label=s)
                        for s in SK_ORDER], loc="center", frameon=False)
    save(fig, "fig6A_legend", tight=True)

    # ---- B. G+C vs density
    d = sp.dropna(subset=["gc_pct", "density"])
    fig, ax = plt.subplots(figsize=FIGSIZE, constrained_layout=True)
    hb = ax.hexbin(d["gc_pct"], density_axis(d["density"]), gridsize=55, mincnt=1,
                   cmap="cividis", linewidths=0)
    hb.set_array(np.interp(np.log10(hb.get_array()), np.log10(C_TICKS), np.arange(len(C_TICKS))))
    hb.set_clim(0, len(C_TICKS) - 1)
    set_density_ticks(ax)
    ax.set_xlabel("Genomic G+C (%)")
    cb = fig.colorbar(hb, ax=ax, ticks=range(len(C_TICKS)))
    cb.ax.set_yticklabels([f"{t:,}" for t in C_TICKS])
    cb.set_label("Species per bin")
    cb.outline.set_linewidth(LW)
    cb.ax.tick_params(width=LW)
    ax.text(0.03, 0.97, "\n".join(f"{r.group}: ρ = {r.rho:.2f}" for r in spear.itertuples()),
            transform=ax.transAxes, va="top", fontsize=12,
            bbox=dict(facecolor="white", edgecolor="none", alpha=0.8, pad=2))
    save(fig, "fig6B_gc_density")

    # ---- C. composition across G+C
    fig, ax = plt.subplots(figsize=FIGSIZE, constrained_layout=True)
    for key, (color, marker) in LINE_STYLE.items():
        ax.fill_between(bins["gc_mid"], bins[f"{key}_q1"], bins[f"{key}_q3"], color=color, alpha=0.3, lw=0)
        ax.plot(bins["gc_mid"], bins[f"{key}_median"], marker=marker, color=color, lw=2.2, ms=7,
                mec="black", mew=0.8, label=CLASS_LABELS[key])
    ax.set_xlabel("Genomic G+C (%)")
    ax.set_ylabel("Fraction of dinucleotides\nin predicted loci")
    ax.legend(frameon=False)
    save(fig, "fig6C_composition_by_gc")

    # ---- D. density per superkingdom
    data = [density_axis(sp.loc[sp["superkingdom"] == sk, "density"].dropna()) for sk in SK_ORDER]
    keep = [i for i, x in enumerate(data) if len(x)]
    fig, ax = plt.subplots(figsize=FIGSIZE, constrained_layout=True)
    vp = ax.violinplot([data[i] for i in keep], positions=keep, showextrema=False, widths=0.8)
    for body, i in zip(vp["bodies"], keep):
        body.set(facecolor=SK_COLORS[SK_ORDER[i]], edgecolor="black", alpha=1.0, linewidth=1.0)
    bp = ax.boxplot([data[i] for i in keep], positions=keep, widths=0.15, **BOX_KW)
    for b in bp["boxes"]:
        b.set_facecolor("white")
    ax.set_xticks(range(len(SK_ORDER)))
    ax.set_xticklabels(SK_ORDER)
    set_density_ticks(ax)
    save(fig, "fig6D_density_by_superkingdom")


if __name__ == "__main__":
    main()
