# ZSeekerDB data migration (new Z-DNA dataset)

Rebuilds `zdnadatabase.duckdb` from the new dataset into the **exact old schema**
with the **same statistics logic**. Written with **DuckDB 1.1.3** (matches the
deployed `go-duckdb v1.8.5` engine — required for file-format compatibility).

## Inputs
- `all_zseeker_final.tar.gz` — per-assembly `*.zseeker.csv` (Chromosome,Start,End,Z-DNA Score,Sequence)
- `zseeker_db_assembly_all_metadata.tsv` — per-assembly metadata incl. precomputed Z-DNA stats

## Pipeline (`run_all.sh` orchestrates)
1. `audit.py` — CSV-vs-TSV assembly name-mismatch audit + regex coverage.
2. `build_data.py` — builds `data` (2.59B rows). Byte-bounded, atomic, **resumable**
   batches (resume = sorted-file prefix via `_ingest_state`).
3. `build_meta_stats.py` — `metadata`, `chromosomes`, `tax_names`, `data_kpis`,
   `data_top_asm`, `data_top_chrom`, and views `zdna` / `metadata_view`.
   Idempotent (skips existing tables; `MIG_FORCE=1` to rebuild).
4. `verify.py` — schema diff vs old, row counts, join integrity, endpoint-SQL replay.

Tunables via env: `MIG_THREADS`, `MIG_MEM_GB`, `MIG_BATCH_BYTES`, `MIG_BATCH_MAXFILES`.

## Result (validated)
- `data`: 2,588,094,125 rows / 324,200 assemblies; audit 0 mismatches; 0 join orphans.
- Schema identical to old DB for all 9 objects; every backend endpoint returns 200.

## Sequence 2-bit codec (`seqcodec.py`) — space-reduction work
Lossless 2-bit packing of the `Sequence` column (72% of DB size) with a raw
fallback for non-ACGT. Regression tests in `tests/` pin the sequence logic:
- `test_seqcodec.py` — encode/decode round-trip, edge/fallback cases, real-sample round-trip.
- `test_query_equivalence.py` — BLOB+decode reproduces identical results to VARCHAR
  for projection, `LIKE` search, filters, lengths, and the `zdna` view shape.

Run: `python3 -m pytest scripts/migrate/tests/ -q`
