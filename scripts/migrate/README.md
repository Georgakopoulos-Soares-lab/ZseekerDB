# ZSeekerDB data migration (Oct-2026 release)

Builds `zdnadatabase_2026-10.duckdb` from the new ZSeeker predictions and the Oct-2026
metadata TSV, keeping the table/column names the backend and frontend already query.
Written with **DuckDB 1.1.3**, to match the deployed `go-duckdb v1.8.5` engine (required
for file-format compatibility).

## Inputs
- `all_zseeker_final.tar.gz`: per-assembly `*.zseeker.csv` (Chromosome,Start,End,Z-DNA Score,Sequence)
- `zseeker_db_assembly_all_metadata.tsv` (Oct-2026, 31 cols, 324,198 assemblies): metadata
  incl. per-assembly Z-DNA stats. Set `MIG_META_TSV` to override the path.

## Data rules
- **Placeholder rows dropped.** ZSeeker writes `Chromosome,,,,` for every sequence without
  predictions (24,116,216 rows); `data` holds real predictions only.
- **Assemblies without predictions dropped** (`MIG_DROP_EMPTY_ASSEMBLIES=1`, default):
  175,983 of 324,198, leaving 148,215 in `metadata`. Assemblies absent from the TSV are dropped too.
- `metadata` column mapping (TSV -> DB): `assembly_accession`->`assembly`,
  `ncbi_summary_taxid`->`taxid`, `resolve_level`->`assembly_level` (`Complete Genome`/`Chromosome`),
  `z_predictions_count`->`obs_n_zdna`, `total_z_bases`->`obs_zbp`,
  `z_density * 1000`->`obs_density_per_kb` (TSV density is a fraction of `genome_size_manual`),
  `is_t2t` = "T2T" in the source filename. `bioproject`/`biosample` no longer exist.
  New TSV fields are appended (see `release.py`).
- `chromosomes` / `tax_names` list only chromosomes / species that have predictions.

## Pipelines
**Incremental (used for this release):** `rebuild_release.py [data|metadata|derived]` copies
`data` from the July build (`zdnadatabase_shrunk.duckdb`, same tarball) with the rules above,
then rebuilds `metadata` and the derived tables. ~1.5h on a vm-small node.

**From scratch:** extract the tarball to `build/csv`, then `run_all.sh`
(`audit.py` -> `build_data.py` -> `build_meta_stats.py` -> `verify.py`).

Both share the metadata/derived/view SQL in `release.py`.

## Verify
`verify.py [db]`: schema, no NULL/placeholder rows, per-assembly counts and bases equal
`metadata`, no orphans either way, density units, and a replay of endpoint/frontend SQL.
Exits non-zero on any failure.

Tunables via env: `MIG_THREADS`, `MIG_MEM_GB`, `MIG_BATCH_BYTES`, `MIG_BATCH_MAXFILES`, `MIG_DB_PATH`.

## Sequence 2-bit codec (`seqcodec.py`): space-reduction experiment, not used
Lossless 2-bit packing of `Sequence`. Benchmarked in July: `LIKE` search via the decode
UDF is ~90x slower than VARCHAR, so the release keeps VARCHAR.
Tests: `python3 -m pytest scripts/migrate/tests/ -q`
