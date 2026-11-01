# Final-dataset descriptive analyses

Run only after the full database build and `scripts/migrate/verify.py` pass:

```bash
python3 -m pip install -r scripts/analysis/requirements.txt
python3 scripts/analysis/figure6.py /path/to/zdnadatabase_final.duckdb /path/to/figure6
```

The script writes source CSVs, per-assembly dinucleotide counts, a JSON report,
and PDF/PNG figures. It does not edit scientific claims automatically.

- A: pooled dinucleotide-step composition within actual prediction sequences.
  This is descriptive composition, not a background enrichment test or an
  independent validation of ZSeeker. Steps across different loci are not joined.
- B: one GC and density mean per positive, non-null species taxid, followed by
  overall Spearman correlation. Each superkingdom is also collapsed to species
  taxids before its correlation. Complete pairs only; counts are reported.
- C: dinucleotide-step fractions computed within each assembly, averaged within
  species taxids, then averaged across species in 5-percentage-point bins of
  species-mean genomic GC. Assemblies without loci have undefined composition
  and are omitted from composition averages; their available GC attributes
  remain part of the species-mean genomic GC.
- D: assembly densities averaged within species and then within superkingdoms,
  including zero densities. Error bars show SEM over species; medians and IQRs
  are exported, and additional violin plots show the distributions.

These are descriptive analyses. Species balancing does not remove phylogenetic
non-independence. RNA-virus sequences remain cDNA-scored sequence predictions;
no validation of Z-RNA formation is inferred.

`--steps PATH` reuses a per-assembly Parquet step-count file only when it was
computed from the exact same database. Do not reuse historical outputs after
changing inputs. The full step-count scan can be expensive for billions of loci.

`portal_figures.py CAPTURE_DIR OUTPUT_DIR` composes Figures 1–5 from the actual
browser captures made by `scripts/qa/capture_paper.py`. Figure 3 redraws the
chromosome-1 calculations from the validated server CSV with larger plot labels:
all loci for window counts, the first 20,000 by Start for length/score and
start/score. It records the plotted scope in `portal_figure_provenance.json`.

`graphical_abstract.py FINAL_DATA_AUDIT.json OUTPUT_DIR` draws an editable SVG,
vector PDF and PNG overview using the verified counts and species-balanced
means. Prediction terminology and the cDNA-scored RNA-virus qualification are
included explicitly.
