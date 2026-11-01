# Full-dataset browser checks

`browser_smoke.py` checks a running portal against the audited final database.
It verifies homepage counts and chart options, all human chromosome aliases,
the results table, six visualization panels, all five client export formats,
the server CSV export, and browser errors. It saves screenshots and a JSON report.

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 scripts/qa/browser_smoke.py --base-url http://127.0.0.1:18080 --output /path/to/browser_checks
```

Start the Go server with the verified database and a built frontend first. The
expected counts in this smoke check describe the audited supplied dataset;
this is an integration check, not a test against synthetic data. The chromosome
1 query explicitly clears the default sequence-content filter.

`capture_paper.py --output /path/to/browser_checks` additionally captures
manuscript panels, verifies the second taxonomy-hierarchy result page, and checks
About/Download provenance and the four Species Browser visualization panels.
Use the same output directory containing the validated server CSV before running
`scripts/analysis/portal_figures.py`.
