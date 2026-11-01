# ZSeekerDB

ZSeekerDB links sequence-based predictions of Z-forming potential to organismal
and viral genome assemblies. A Go API queries one DuckDB file; React provides
sequence search, assembly browsing, plots and downloads. RNA-virus records are
scored as cDNA sequences; these scores are not experimental validation of Z-RNA
formation.

[Open the portal](https://zseeker-db.com/) ·
[Build and export documentation](scripts/migrate/README.md) ·
[Reproduce the scientific figures](scripts/analysis/README.md)

## Verified catalog

The database built on 27 October 2026 contains:

| Metric | Value |
| --- | ---: |
| All genome assemblies | 324,198 |
| Assemblies with predictions | 148,215 |
| Assemblies without predictions | 175,983 |
| Species grouping identifiers | 60,841 |
| Predicted loci | 2,563,977,897 |
| Species-balanced mean genome size | 108,166,650 bp |
| Species-balanced mean G+C content | 47.7% |

Assembly attributes come from the assembly metadata TSV shipped as
`data/metadata.tsv.gz`. `genome_size_manual` is computed from each FASTA as
total bases minus N stretches (`scripts/benchmarking/04_genome_size.sh`);
prediction counts, predicted bases and densities (`z_bases / genome_size_manual`)
are computed from the ZSeeker output CSVs (`scripts/benchmarking/08_z_density.py`).
Genome-size statistics use `genome_size_manual`. Species grouping uses
`ncbi_summary_species_taxid` (loaded as `species_taxid`), rather than the
assembly/strain `ncbi_summary_taxid`. The metadata includes assemblies with no
predictions, and the Species Browser lists every assembly with
`genome_size_manual` of at least 1,000 bp, including those without predictions.

The final assembly-metadata TSV has SHA-256
`2a67abe869d6ae5a88843ae98ff0e3ac966322cc2a2091bf51d01926f9ed051e`.

## Dataset downloads and reconstruction

The **October 2026 datasets are public on Zenodo**: 23 downloadable archives
in 14 open records, published 26 October 2026. Every direct link below returned
HTTP 200 with the expected file size on 1 November 2026. The Downloads page
also lists each file's published MD5 checksum and its record/DOI.

| Scope | CSV | JSON | Parquet | BED |
| --- | --- | --- | --- | --- |
| Entire dataset | [![All CSV Part 1 of 2](https://img.shields.io/badge/CSV-Part%201%20of%202-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677639/files/zseeker_csv_part1.tar.gz?download=1) [![All CSV Part 2 of 2](https://img.shields.io/badge/CSV-Part%202%20of%202-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23678010/files/zseeker_csv_part2.tar.gz?download=1) | [![All JSON Part 1 of 2](https://img.shields.io/badge/JSON-Part%201%20of%202-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677625/files/zseeker_json_part1.tar.gz?download=1) [![All JSON Part 2 of 2](https://img.shields.io/badge/JSON-Part%202%20of%202-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677745/files/zseeker_json_part2.tar.gz?download=1) | [![All PARQUET Part 1 of 2](https://img.shields.io/badge/PARQUET-Part%201%20of%202-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677791/files/zseeker_parquet_part1.tar.gz?download=1) [![All PARQUET Part 2 of 2](https://img.shields.io/badge/PARQUET-Part%202%20of%202-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677789/files/zseeker_parquet_part2.tar.gz?download=1) | [![All BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677870/files/zseekerdb_bed.tar.gz?download=1) |
| Archaea | [![Archaea CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677150/files/archaea_CSV.tar.gz?download=1) | [![Archaea JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677146/files/archaea_JSON.tar.gz?download=1) | [![Archaea PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677152/files/archaea_PARQUET.tar.gz?download=1) | [![Archaea BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/archaea_BED.tar.gz?download=1) |
| Bacteria | [![Bacteria CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677150/files/bacteria_CSV.tar.gz?download=1) | [![Bacteria JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677146/files/bacteria_JSON.tar.gz?download=1) | [![Bacteria PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677152/files/bacteria_PARQUET.tar.gz?download=1) | [![Bacteria BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/bacteria_BED.tar.gz?download=1) |
| Eukaryota | [![Eukaryota CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677533/files/eukaryota_CSV.tar.gz?download=1) | [![Eukaryota JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677610/files/eukaryota_JSON.tar.gz?download=1) | [![Eukaryota PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677297/files/eukaryota_PARQUET.tar.gz?download=1) | [![Eukaryota BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/eukaryota_BED.tar.gz?download=1) |
| Viruses | [![Viruses CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677150/files/viruses_CSV.tar.gz?download=1) | [![Viruses JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677146/files/viruses_JSON.tar.gz?download=1) | [![Viruses PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677152/files/viruses_PARQUET.tar.gz?download=1) | [![Viruses BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/viruses_BED.tar.gz?download=1) |

For the complete dataset, download **both parts of the same CSV, JSON or Parquet
format**. The full archives are split by assembly accession; each part contains
the complete metadata. Individual superkingdom archives provide a smaller download.
Extract the `.tar.gz` files to access prediction and metadata tables.

The published records report **324,198 assemblies and 2,563,977,897 predictions**,
matching the portal catalog above. Use the metadata bundled with the downloaded
archives for their assembly attributes and counts.

**Archived BED coordinates:** the published four-column files contain chromosome,
start, native inclusive end and raw ZSeeker score. A checked locus is
`CP115555.1:605–655` (51 bp); for standard half-open BED it must be `605–656`.
Add one to the end before using these archived BED files with BED tools. The
repository's `export_release.py` already performs this conversion and writes
assembly/score names when generating BED4. Archived chromosome accessions are
preserved; only the portal names human chromosomes 1–22, X, Y (see below).

### Reconstruction from repository-generated exports

To rebuild the verified catalog from Parquet exports produced by this repository,
unpack exactly one copy of each shard and use its matching final metadata TSV:

```bash
python3 -m pip install -r scripts/migrate/requirements.txt
python3 scripts/migrate/import_release.py '/path/to/unpacked/**/*.parquet' /path/to/assembly_metadata.tsv /path/to/new.duckdb
```

The importer restores native human chromosome accessions, rebuilds derived
tables and runs the database verifier. It refuses to overwrite an existing
database. See the [build documentation](scripts/migrate/README.md) for the source
CSV pipeline, export commands and checksum manifest.

## Database design

`assembly` is the join key between predictions and assembly metadata. NCBI
accessions retain their version suffix (for example `GCF_009914755.1`). The source
TSV supplies assembly attributes. Its prediction summary fields can be stale;
the final build recomputes counts, predicted bases and density from `data`.

| Object | Purpose |
| --- | --- |
| `data` | One row per predicted locus, stored with native chromosome accession |
| `metadata_all` | One row per input assembly, including assemblies without predictions |
| `metadata` | Browser subset, by default `obs_n_zdna > 0`; legacy field layout |
| `chromosomes` | Distinct chromosome accessions from `data` |
| `tax_names` | Distinct `metadata.tax_name` values with genome size ≥1,000 bp |
| `data_kpis` | Prediction-wide aggregate statistics |
| `data_top_asm` | Prediction counts grouped by assembly |
| `data_top_chrom` | Prediction counts grouped by chromosome accession |
| `zdna` | Projection of `data`, exposing `assembly` as `Assembly` |
| `metadata_view` | Display-name projection of `metadata`, restricted to genome size ≥1,000 bp |

Views are ordinary SQL views, not materialized joins. The API uses `data` and
`metadata` directly for most searches. Homepage counts and balanced summaries
use `metadata_all`, with no minimum genome-size filter on counts. This avoids
excluding small viral genomes or assemblies with no predictions.

## Field-level schema

### Predictions (`data` and `zdna`)

| Field | DuckDB type | Meaning / units / example |
| --- | --- | --- |
| `Chromosome` | VARCHAR | Source sequence accession, e.g. `NC_060925.1` |
| `Start` | BIGINT | Zero-based start, inclusive; e.g. 2721 |
| `End` | BIGINT | Zero-based end, inclusive; e.g. 2744 |
| `Z-DNA Score` | FLOAT | ZSeeker sequence score, dimensionless; e.g. 96.5 |
| `Sequence` | VARCHAR | Predicted nucleotide sequence; length = End − Start + 1 |
| `assembly` | VARCHAR | Versioned assembly accession; `Assembly` in `zdna` |

CSV, TSV, JSON, XML and Excel result exports retain native inclusive ends.
BED uses zero-based, half-open intervals: `chromStart = Start`,
`chromEnd = End + 1`. Conversion must be explicit; renaming a CSV to BED is
not a coordinate conversion. GFF3 coordinates are one-based and inclusive.

For `GCF_009914755.1` only, the portal's `data` view renames
`NC_060925.1`–`NC_060948.1` to `1`–`22`, `X`, `Y`, so searches, filters, plots
and result exports use these names. Other assemblies and unmapped contigs keep
their source accessions. The DuckDB file itself keeps source coordinates and
source accession names.

### Assembly metadata

`metadata_all` contains the following fields. `metadata` has the same fields
except `species_taxid`, preserving the existing browser schema. Empty text
becomes SQL NULL; failed numeric conversions become NULL, not zero.

| Field | Type | TSV source / definition |
| --- | --- | --- |
| `assembly` | VARCHAR | `assembly`; unique accession, including assembly version |
| `bioproject` | VARCHAR | NULL when absent from the supplied TSV |
| `biosample` | VARCHAR | NULL when absent from the supplied TSV |
| `taxid` | BIGINT | `ncbi_summary_taxid` or `ncbi_taxid`; may identify a strain |
| `species_taxid` | BIGINT | `ncbi_summary_species_taxid` or `ncbi_species_taxid`; species grouping key |
| `assembly_level` | VARCHAR | `resolve_level`; complete → Complete Genome, chromosome → Chromosome |
| `genome_size` | BIGINT | `genome_size`, bp; not substituted with `genome_size_manual` |
| `gc_percent` | DOUBLE | `gc_percent`, percentage points (0–100) |
| `superkingdom` | VARCHAR | `superkingdom`; e.g. Eukaryota |
| `kingdom` | VARCHAR | `kingdom`; e.g. Metazoa |
| `phylum` | VARCHAR | `phylum`; e.g. Chordata |
| `class` | VARCHAR | `class`; e.g. Mammalia |
| `order` | VARCHAR | `order`; e.g. Primates |
| `family` | VARCHAR | `family`; e.g. Hominidae |
| `genus` | VARCHAR | `genus`; e.g. Homo |
| `tax_name` | VARCHAR | `tax_name`; source taxon label, e.g. Homo sapiens |
| `is_t2t` | BOOLEAN | Filename contains T2T; filename heuristic, not independent completeness validation |
| `viral_realm` | VARCHAR | `viral_realm`; supplied upstream |
| `updated_tax_name` | VARCHAR | `updated_tax_name`; supplied upstream |
| `obs_zbp` | BIGINT | Sum of actual locus sequence lengths, predicted bases (bp); source TSV field `Z-DNA/-RNA bases count` is replaced during the final build |
| `obs_density_per_kb` | DOUBLE | `obs_zbp * 1000 / genome_size`; predicted bp per 1,000 genome bp; NULL if genome size is unavailable or nonpositive |
| `obs_n_zdna` | BIGINT | Actual number of prediction rows; source TSV field `Z-DNA/-RNA predictions count` is replaced during the final build |

Additional source TSV attributes are retained in the archived TSV, not silently
promoted to queryable fields. Taxonomy normalization, including the Protists and viral-realm assignments, is reproduced by scripts/benchmarking/06_add_taxonomy.py All supplied taxon labels are retained.

### Auxiliary fields

| Object | Fields and types |
| --- | --- |
| `chromosomes` | `Chromosome VARCHAR` |
| `tax_names` | `tax_name VARCHAR` |
| `data_kpis` | `total_sites BIGINT`, `distinct_chr BIGINT`, `avg_score DOUBLE`, `min_score DOUBLE`, `max_score DOUBLE`, `avg_seq_len DOUBLE`, `distinct_asm BIGINT`, `computed_at TIMESTAMP WITH TIME ZONE` |
| `data_top_asm`, `data_top_chrom` | `k VARCHAR` (assembly or chromosome), `c BIGINT` (locus count) |

`metadata_view` exposes `assembly`, `bioproject`, `biosample`, `T2T`, `Genome size`,
`Taxon ID`, `GC content (%)`, all eight taxonomic name/rank fields,
`Viral realm`, `Infraspecific name`, `Z-DNA bps`, `Z-DNA density (per kb)`,
and `Number of predicrions` (legacy spelling). Types are inherited unchanged.

## Summary statistics

Homepage genome size (`genome_size_manual`) and GC are calculated in two
stages: average the assembly values within each `species_taxid`, then average
those species means. Missing values are omitted independently for each metric.
Kingdom density uses the same two-stage averaging within each kingdom,
including zero densities for assemblies without predictions, over assemblies
with `genome_size_manual` of at least 1,000 bp, and excludes names containing
`unclassified` before ranking the ten highest kingdoms. Species balancing
reduces multiple-assembly weighting; it is not a correction for phylogenetic
dependence.

The two superkingdom charts count assemblies and unique species taxids with
`genome_size_manual` of at least 1,000 bp; in this release every assembly
qualifies, so the assembly bars sum to the assembly KPI. The score histogram
uses a deterministic hash sample averaging about four predictions per species
grouping ID. All homepage results are computed once at startup and served
from memory for the life of the process.

Chromosome plots count loci in ten equal-width windows by their zero-based
`Start`; genome-wide plots count loci per chromosome. These are locus counts,
not predicted base-pair densities. Per-chromosome reference lengths are not
stored: the window extent is the assembly genome size for single-sequence
assemblies, otherwise it runs to the last predicted base (`MAX(End) + 1`).

## Data pipeline

Use **DuckDB 1.1.3**, matching **go-duckdb 1.8.5**, for database-file compatibility.
The application does not currently use the experimental two-bit sequence codec.

1. `scripts/migrate/audit.py`: compare source CSV assembly identifiers with the TSV.
2. `build_data.py`: ingest sorted per-assembly CSV files in byte-bounded atomic
   batches. `_ingest_state` records the committed file prefix for resume. The
   input directory and ordering must remain unchanged during a resumed build.
   Placeholder rows with missing chromosome, coordinates, score or sequence,
   invalid intervals or inconsistent sequence length are excluded.
3. `build_meta_stats.py`: build `metadata_all`, recompute observed locus counts,
   predicted bases and densities from `data`, then rebuild the browser `metadata` subset,
   auxiliary tables, aggregates and views. Existing nonempty objects are reused;
   set `MIG_FORCE=1` to rebuild derived objects. It does not rewrite `data`.
4. `verify.py`: check field types, join integrity, actual data counts and the
   SQL used by portal endpoints. A failed verification exits nonzero.

`release.py` provides a metadata-only rebuild, without copying billions of
prediction rows. It accepts both `ncbi_*` and `ncbi_summary_*` TSV taxid names,
validates unique assembly keys, and replaces both metadata tables atomically.
Set `MIG_RECOMPUTE_OBSERVED=1` when refreshing metadata against an existing
prediction table; this scans `data` to replace stale TSV prediction summaries.
The default `MIG_DROP_EMPTY_ASSEMBLIES=1` affects `metadata` only. `metadata_all`
always keeps the entire input TSV.

```bash
python3 -m pip install -r scripts/migrate/requirements.txt
export MIG_ROOT=/path/to/ZSeekerDB_migration
export MIG_DB_PATH="$MIG_ROOT/zdnadatabase.duckdb"
export MIG_META_TSV="$MIG_ROOT/zseeker_db_assembly_all_metadata.tsv"
export MIG_CSV_DIR="$MIG_ROOT/build/csv"
MIG_RECOMPUTE_OBSERVED=1 python3 scripts/migrate/release.py
python3 scripts/migrate/verify.py
python3 -m pytest scripts/migrate/tests/ -q
```

A source-archive inventory can be generated without extraction:
`python3 scripts/migrate/audit_archive.py all_zseeker_final.tar.gz inventory.csv`.
It counts records and small-file placeholders, not every row's validity.
Reconcile the inventory, input TSV and built DB before publishing totals or
rewriting manuscript statistics. Recomputing a prediction table does not
recompute scientific figures, correlations or supplementary analyses.

## Web interface and implementation

The checked-in manifests specify Gin **1.10.1**, go-duckdb **1.8.5**, Go **1.24**
(toolchain **1.24.5**), React **^19.1.1**, Material UI **^7.3.1**, ECharts **^5.6.0**,
echarts-for-react **^3.0.2**, Vite **^7.1.2**, and TypeScript **~5.8.3**.
`frontend/package-lock.json` pins the resolved JavaScript dependencies. These
are the code's versions; historical manuscript dependency numbers are not used
as a substitute for the manifests.

The frontend's Explorer builds analytical SELECT queries for the API. Assembly
search links use stable accessions; human chromosome names come from the
backend `data` view. Server CSV exports stream rows; client CSV, TSV, JSON,
XML and Excel (HTML `.xls`) exports are capped at one million rows and fetched
in 50,000-row batches.

## API and SQL safeguards

Used by the React UI:

- `GET /api/home/insights`: homepage KPIs and charts, computed once at startup.
- `GET /api/metadata/list`, `/export`, `/charts`, `/distinct`: Species browser
  table, downloads (CSV, TSV, JSON, XML, XLS), charts and filter options; all
  take the same taxonomy/range filter parameters.
- `GET /api/sql?query=...` or `POST /api/sql` with `{"sql":"SELECT ..."}`:
  a single validated, read-only SELECT query.

Other routes:

- `GET /api/health`: health, including unavailable database status.
- `GET /api/zdna/search`, `/export`, `/score_histogram`: raw predictions for one
  assembly; `assembly_eq=<accession>` is required.
- `GET /api/zdna/distinct_chr`, `/api/metadata/classes/top`,
  `/api/metadata/preview`, `/api/zdna/preview`.
- `POST /api/admin/init`: recreates views; disabled unless `ADMIN_TOKEN` is set,
  and then requires the same value in the `X-Admin-Token` header.

SQL requests must be exactly one statement beginning with `SELECT`. DuckDB's own
parser validates the request (`json_serialize_sql` serializes only SELECT
statements, one entry per statement), so chained statements and write, DDL,
ATTACH, COPY, EXPORT, INSTALL, LOAD, PRAGMA and SET commands are rejected. After
startup the engine sets `enable_external_access = false` and
`lock_configuration = true`, so no query can read or write files or the
network or change these settings. A query is cancelled when its client
disconnects. Large downloads should use the archived datasets.

## Deployment and local validation

The Docker image builds React and serves it from Go in one Railway service.
Mount a volume at `/data`, place the database at `/data/zdnadatabase.duckdb`,
and set `DUCKDB_PATH` accordingly. `PORT` is supplied by Railway. Optional
`CORS_ORIGIN` is a comma-separated origin list; it is not needed with the
bundled frontend.

At startup the backend attaches the DuckDB file **read-only** as `zdb` and
exposes its tables under their usual names, except `metadata`. The DuckDB
`metadata` table only holds assemblies with predictions, so the backend loads
`data/metadata.tsv.gz` (`METADATA_GLOB`; included in the Docker image) into an
in-memory `metadata` table with all release assemblies, including those with
no predictions. That table uses `genome_size_manual` as the only genome size
(the TSV's raw `genome_size` is not loaded) and takes prediction counts,
predicted bases and density (`z_density` × 1,000, per kb) from the TSV. The
`data` view applies the human chromosome names described above. The volume is
never modified.

Without the database or the metadata TSV the service starts with degraded
health (HTTP 200, `"status":"degraded"`) and data routes return 503; restart
after installing the file. Database files are excluded from Git.

| Variable | Default |
| --- | --- |
| `DUCKDB_PATH` | `data/zdnadatabase.duckdb` |
| `METADATA_GLOB` | `data/metadata.tsv.gz` |
| `DUCKDB_THREADS` | `6` |
| `DUCKDB_MEMORY_LIMIT_GB` | `4` |
| `DUCKDB_TEMP_DIR`, `DUCKDB_MAX_TEMP_GIB` | `data/tmp`, `50` |
| `HOST`, `PORT` | `0.0.0.0`, `8080` |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:3000` |
| `ADMIN_TOKEN` | unset (`/api/admin/init` disabled) |

```bash
cd backend && go test ./...
cd ../frontend && npm ci && npm test && npm run build
```

Use Node 22.12 or later for Vite 7. The source, schema documentation, exact input
metadata, checksums and final dataset must accompany the public archive. Public
links must identify published records and exact filenames; draft URLs are not
public download links.
