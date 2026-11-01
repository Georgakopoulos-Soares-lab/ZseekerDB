# Final-dataset descriptive analyses

Run only after the full database build and `scripts/migrate/verify.py` pass:

```bash
python3 -m pip install -r scripts/analysis/requirements.txt
```

`portal_figures.py CAPTURE_DIR OUTPUT_DIR` composes Figures 1–5 from the actual
browser captures made by `scripts/qa/capture_paper.py`. Figure 3 redraws the
chromosome-1 calculations from the validated server CSV with larger plot labels:
all loci for window counts, the first 20,000 by Start for length/score and
start/score. It records the plotted scope in `portal_figure_provenance.json`.

`graphical_abstract.py FINAL_DATA_AUDIT.json OUTPUT_DIR` draws an editable SVG,
vector PDF and PNG overview using the verified counts and species-balanced
means. Prediction terminology and the cDNA-scored RNA-virus qualification are
included explicitly.
