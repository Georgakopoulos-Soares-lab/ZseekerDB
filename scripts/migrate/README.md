# ZSeekerDB database build and exports

Builds the portal DuckDB from source predictions and the assembly metadata TSV.
Use **DuckDB 1.1.3**, matching **go-duckdb v1.8.5**. The complete field-level
schema and pipeline rules are documented in the [main README](../../README.md).

## Inputs
- `all_zseeker_final.tar.gz` — per-assembly `*.zseeker.csv` (Chromosome,Start,End,Z-DNA Score,Sequence)
- `zseeker_db_assembly_all_metadata.tsv` — per-assembly metadata incl. precomputed Z-DNA stats

## Pipeline (`run_all.sh` orchestrates)
1. `audit.py` — CSV-vs-TSV assembly name-mismatch audit + regex coverage.
2. `build_data.py` — builds `data` from valid prediction records. Byte-bounded, atomic, **resumable**
   batches (resume = sorted-file prefix via `_ingest_state`).
3. `build_meta_stats.py` — `metadata_all` (all input assemblies), `metadata` (prediction-bearing browser subset), `chromosomes`, `tax_names`, `data_kpis`,
   `data_top_asm`, `data_top_chrom`, and views `zdna` / `metadata_view`.
   Idempotent (skips existing tables; `MIG_FORCE=1` to rebuild).
4. `verify.py` — expected schema, row counts, join integrity, endpoint-SQL replay.

Tunables via env: `MIG_THREADS`, `MIG_MEM_GB`, `MIG_BATCH_BYTES`, `MIG_BATCH_MAXFILES`.

## Validation and input selection

Set `MIG_ROOT`, `MIG_DB_PATH`, `MIG_META_TSV` and `MIG_CSV_DIR` explicitly for a
portable build. The workspace TSV has 324,200 rows and 60,841 species taxids;
its stored prediction totals must be reconciled against the source archive.
Historical build logs are not evidence for the current input files.

`release.py` rebuilds metadata; set `MIG_RECOMPUTE_OBSERVED=1` to replace
stale TSV prediction summaries from the actual `data` table. The full
`build_meta_stats.py` path always recomputes these summaries. It supports both `ncbi_species_taxid` and
`ncbi_summary_species_taxid` and always retains all assemblies in `metadata_all`.
`MIG_DROP_EMPTY_ASSEMBLIES=1` affects the browser `metadata` subset only.
`verify.py` exits nonzero on schema, join, metadata/prediction-count or SQL errors.
Run the verifier against the full rebuilt database, not the two-bit benchmark.

`audit_archive.py INPUT.tar.gz inventory.csv` inventories the source tar without
extracting it. `prepare_human.py INPUT_HUMAN.csv OUTPUT_DIR` writes a separate
human CSV and BED4, validates every coordinate/sequence length and records hashes.
Original source files and existing archive bundles are preserved.

## Sequence 2-bit codec (`seqcodec.py`) — space-reduction work
Lossless 2-bit packing of the `Sequence` column (72% of DB size) with a raw
fallback for non-ACGT. Regression tests in `tests/` pin the sequence logic:
- `test_seqcodec.py` — encode/decode round-trip, edge/fallback cases, real-sample round-trip.
- `test_query_equivalence.py` — BLOB+decode reproduces identical results to VARCHAR
  for projection, `LIKE` search, filters, lengths, and the `zdna` view shape.

Run: `python3 -m pytest scripts/migrate/tests/ -q`

## Final supplementary metadata and downloads

After the database verifier passes:

```bash
python3 scripts/migrate/export_metadata.py "$MIG_DB_PATH" "$MIG_META_TSV" /path/to/assembly_metadata.tsv
python3 scripts/migrate/export_release.py "$MIG_DB_PATH" /path/to/assembly_metadata.tsv /path/to/final_archive
```

The metadata exporter preserves the supplied assembly attributes and replaces
stale prediction summaries with verified observations. The archive exporter
writes CSV, JSON arrays, Parquet and BED4, partitioned by superkingdom, then
checksummed archives. Native exports retain inclusive ends; BED adds one to the
end. Only the specified human assembly receives chromosome aliases.

Full CSV, JSON and Parquet exports have two parts: Archaea/Bacteria/Viruses,
and Eukaryota. Both are needed for the complete dataset. Full-download containers hold the
already-compressed superkingdom archives; unpack both container levels. This
avoids recompressing hundreds of gigabytes twice. The manifest lists
membership, byte size, SHA-256 and MD5. Parallel gzip members are bounded in
memory and readable by ordinary gzip/tar tools. Completed phases and bundles
can be resumed; incomplete partition directories or `.partial` archives must
be inspected before retrying. Existing archive directories are not overwritten.

Public record IDs and file checksums must be verified anonymously before
populating `frontend/src/data/archive.ts`. Upload-state IDs are not public links.

## Reconstruct from the Parquet downloads

Unpack the full Parquet containers and their inner archives, keeping exactly one
copy of each shard. With the complete final metadata TSV:

```bash
python3 scripts/migrate/import_release.py '/path/to/unpacked/**/*parquet' /path/to/assembly_metadata.tsv /path/to/new.duckdb
```

The importer checks the expected row total, restores native human chromosome
accessions, builds all derived objects and runs the same verifier. It refuses to
overwrite an existing database. The final metadata supplies the filename-derived
T2T flag when original prediction filenames are unavailable. Use DuckDB 1.1.3.

`export_schema.py DATABASE OUTPUT.tsv` exports the actual public schema, including
types, units, field definitions and examples, for Supplementary Table 5.
